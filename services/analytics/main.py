from fastapi import FastAPI
import psycopg2
import pandas as pd
import numpy as np
import os

from dotenv import load_dotenv

from sklearn.dummy import DummyRegressor
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.ensemble import RandomForestRegressor

from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# --------------------------------------------------
# Setup
# --------------------------------------------------

load_dotenv(dotenv_path="../../apps/web/.env.local")

app = FastAPI()


def get_db_connection():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL is missing from environment variables")
    return psycopg2.connect(db_url)


# --------------------------------------------------
# Data loading
# --------------------------------------------------

def load_user_data(user_id: str) -> pd.DataFrame:
    conn = get_db_connection()

    query = """
        SELECT 
            day,
            sleep_total_seconds,
            steps,
            hrv_avg_ms,
            resting_hr_bpm,
            readiness_score,
            stress_high_minutes
        FROM daily_summary
        WHERE user_id = %s
        ORDER BY day ASC
    """

    df = pd.read_sql(query, conn, params=(user_id,))
    conn.close()

    if df.empty:
        return df

    # Make sure day is a real datetime
    df["day"] = pd.to_datetime(df["day"])
    df = df.sort_values("day").reset_index(drop=True)

    return df


# --------------------------------------------------
# Feature engineering / dataset preparation
# --------------------------------------------------

def prepare_dataset(df: pd.DataFrame):
    """
    Builds a dataset where today's features predict tomorrow's readiness.
    """

    working_df = df.copy()

    # Target = tomorrow's readiness
    working_df["target_readiness_tomorrow"] = working_df["readiness_score"].shift(-1)

    # Optional but recommended: extra engineered features 
    # Window 3-day averages and .rolling Instead of only looking at one day, the code also looks at the recent trend.
    working_df["sleep_hours"] = working_df["sleep_total_seconds"] / 3600.0
    working_df["sleep_3d_avg"] = working_df["sleep_hours"].rolling(window=3, min_periods=1).mean()
    working_df["hrv_3d_avg"] = working_df["hrv_avg_ms"].rolling(window=3, min_periods=1).mean()
    working_df["steps_3d_avg"] = working_df["steps"].rolling(window=3, min_periods=1).mean()
    working_df["stress_3d_avg"] = working_df["stress_high_minutes"].rolling(window=3, min_periods=1).mean()

    # Day-to-day deltas negative values are bad positive values are good 
    working_df["sleep_delta"] = working_df["sleep_hours"].diff()
    working_df["hrv_delta"] = working_df["hrv_avg_ms"].diff()
    working_df["resting_hr_delta"] = working_df["resting_hr_bpm"].diff()

    # A simple sleep debt proxy (target = 7 hours)
    working_df["sleep_debt_hours"] = np.maximum(0, 7 - working_df["sleep_hours"])

    # Features to train with
    features = [
        "sleep_total_seconds",
        "steps",
        "hrv_avg_ms",
        "resting_hr_bpm",
        "stress_high_minutes",
        "readiness_score",      # very useful predictor
        "sleep_hours",
        "sleep_3d_avg",
        "hrv_3d_avg",
        "steps_3d_avg",
        "stress_3d_avg",
        "sleep_delta",
        "hrv_delta",
        "resting_hr_delta",
        "sleep_debt_hours",
    ]

    # Remove last row from training because it has no tomorrow target
    train_df = working_df.dropna(subset=["target_readiness_tomorrow"]).copy()

    X = train_df[features]
    y = train_df["target_readiness_tomorrow"]

    return working_df, train_df, X, y, features


# --------------------------------------------------
# Model definitions
# --------------------------------------------------

def get_models():
    return {
        "DummyMean": DummyRegressor(strategy="mean"), # Average of all previous readiness scores
        "LinearRegression": LinearRegression(), # Simple linear model more sleep more readiness score
        "Ridge": Ridge(alpha=1.0), # Linear model with regularization
        "RandomForest": RandomForestRegressor( # Decision tree based model
            n_estimators=100,
            max_depth=5,
            random_state=42
        ),
    }


# --------------------------------------------------
# Model evaluation
# --------------------------------------------------

def safe_r2(y_true, y_pred):
    # R² can fail / be misleading on extremely tiny folds
    try:
        return r2_score(y_true, y_pred)
    except Exception:
        return None


def evaluate_models(X: pd.DataFrame, y: pd.Series):
    """
    Compares models using TimeSeriesSplit.
    Returns sorted results by MAE.
    """

    models = get_models()
    results = []

    # Need enough rows for splits
    n_rows = len(X)
    if n_rows < 6:
        return {
            "error": "Not enough training rows to compare models safely. Try with at least 7-10 days of history."
        }

    # Number of splits should adapt to data size
    n_splits = min(3, n_rows - 1)
    if n_splits < 2:
        return {
            "error": "Not enough data for TimeSeriesSplit."
        }
    # TimeSeriesSplit is a cross-validation technique that splits the data into folds in a way that preserves the temporal order of the data.
    # This is important for time series data because we want to train on past data and test on future data.
    tscv = TimeSeriesSplit(n_splits=n_splits)
    # Loop through each model, each fold train the model and evaluate it
    for model_name, model in models.items():
        mae_scores = []
        rmse_scores = []
        r2_scores = []

        fold_details = []
        # Loop through each fold and train the model
        for fold_number, (train_idx, test_idx) in enumerate(tscv.split(X), start=1):
            X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
            y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
            # Imputer missing values fill with average
            pipeline = Pipeline([
                ("imputer", SimpleImputer(strategy="mean")),
                ("model", model)
            ])

            pipeline.fit(X_train, y_train)
            preds = pipeline.predict(X_test)
            # How big is the mistake on average?
            mae = mean_absolute_error(y_test, preds) #lower MAE is better Mean Absolute Error
            rmse = np.sqrt(mean_squared_error(y_test, preds)) #lower RMSE is better Root Mean Squared Error
            # Is this model actually learning useful patterns, or is it basically useless?
            # very little data, R² becomes unstable
            r2 = safe_r2(y_test, preds) #higher R2 is better R-squared 1 amazing 0 no correlation -1 worst

            mae_scores.append(mae)
            rmse_scores.append(rmse)
            if r2 is not None:
                r2_scores.append(r2)

            fold_details.append({
                "fold": fold_number,
                "train_size": int(len(train_idx)),
                "test_size": int(len(test_idx)),
                "mae": round(float(mae), 3),
                "rmse": round(float(rmse), 3),
                "r2": round(float(r2), 3) if r2 is not None else None
            })

        results.append({
            "model": model_name,
            "mean_mae": round(float(np.mean(mae_scores)), 3),
            "mean_rmse": round(float(np.mean(rmse_scores)), 3),
            "mean_r2": round(float(np.mean(r2_scores)), 3) if r2_scores else None,
            "folds": fold_details
        })

    # Lower MAE is better
    results = sorted(results, key=lambda r: r["mean_mae"])
    return {
        "results": results,
        "best_model_name": results[0]["model"] if results else None
    }


# --------------------------------------------------
# Train best model on full training set
# --------------------------------------------------

def build_pipeline_for_model(model_name: str):
    models = get_models()
    if model_name not in models:
        raise ValueError(f"Unknown model: {model_name}")

    return Pipeline([
        ("imputer", SimpleImputer(strategy="mean")),
        ("model", models[model_name])
    ])


def train_best_model(X: pd.DataFrame, y: pd.Series, best_model_name: str):
    pipeline = build_pipeline_for_model(best_model_name)
    pipeline.fit(X, y)
    return pipeline


# --------------------------------------------------
# Prediction helpers
# --------------------------------------------------

def build_today_features_row(working_df: pd.DataFrame, features: list[str]) -> pd.DataFrame:
    """
    Returns the latest day as a 1-row DataFrame with the same features used in training.
    """
    latest_row = working_df.iloc[-1]
    return latest_row[features].to_frame().T


def build_prediction_reason(latest_row: pd.Series, working_df: pd.DataFrame) -> str:
    reasons = []

    avg_sleep_seconds = working_df["sleep_total_seconds"].mean()
    avg_hrv = working_df["hrv_avg_ms"].mean()
    avg_stress = working_df["stress_high_minutes"].mean()
    avg_resting_hr = working_df["resting_hr_bpm"].mean()
    # Does the latest row actually have a sleep value, or is it missing and Was I able to calculate an average sleep value?
    if pd.notna(latest_row.get("sleep_total_seconds")) and pd.notna(avg_sleep_seconds):
        if latest_row["sleep_total_seconds"] < avg_sleep_seconds:
            reasons.append("sleep below your recent average")

    if pd.notna(latest_row.get("hrv_avg_ms")) and pd.notna(avg_hrv):
        if latest_row["hrv_avg_ms"] < avg_hrv:
            reasons.append("HRV below your recent average")

    if pd.notna(latest_row.get("stress_high_minutes")) and pd.notna(avg_stress):
        if latest_row["stress_high_minutes"] > avg_stress:
            reasons.append("stress above your recent average")

    if pd.notna(latest_row.get("resting_hr_bpm")) and pd.notna(avg_resting_hr):
        if latest_row["resting_hr_bpm"] > avg_resting_hr:
            reasons.append("resting heart rate above your recent average")

    if not reasons:
        return "balanced recent signals"

    return ", ".join(reasons)


def label_readiness(score: float) -> str:
    if score >= 85:
        return "Optimal"
    if score >= 70:
        return "Good"
    if score >= 55:
        return "Fair"
    return "Low"

def classify_recovery_day(score: float) -> str:
    if score >= 75:
        return "Ready"
    if score >= 60:
        return "Moderate"
    return "Recovery"


def build_prediction_confidence(best_model_metrics: dict, training_rows: int) -> dict:
    mae = float(best_model_metrics["mean_mae"])

    # Lower error and more history should translate into more trust in the prediction.
    confidence_score = round(100 - (mae * 6))

    if training_rows < 10:
        confidence_score -= 15
    elif training_rows < 21:
        confidence_score -= 7

    confidence_score = max(35, min(95, confidence_score))

    if confidence_score >= 80:
        confidence_label = "High"
    elif confidence_score >= 65:
        confidence_label = "Medium"
    else:
        confidence_label = "Low"

    return {
        "confidence_score": int(confidence_score),
        "confidence_label": confidence_label,
    }


def build_recommended_action(recovery_day: str) -> str:
    if recovery_day == "Ready":
        return "Good day for harder training or a longer workout."
    if recovery_day == "Moderate":
        return "Keep effort moderate and avoid stacking extra stress."
    return "Prioritize recovery with light movement, mobility, and an early night."


# --------------------------------------------------
# Endpoint: compare models only
# --------------------------------------------------

@app.get("/compare-models")
def compare_models(user_id: str):
    df = load_user_data(user_id)

    if df.empty:
        return {"error": f"No data found for user_id={user_id}"}

    if len(df) < 7:
        return {
            "error": "Not enough data to compare models. Try with at least 7-10 days of history.",
            "rows_found": int(len(df))
        }

    working_df, train_df, X, y, features = prepare_dataset(df)

    if len(train_df) < 6:
        return {
            "error": "Not enough training rows after shifting target. Need more data.",
            "rows_found": int(len(train_df))
        }

    comparison = evaluate_models(X, y)
    if "error" in comparison:
        return comparison

    return {
        "user_id": user_id,
        "history_days": int(len(df)),
        "training_rows": int(len(train_df)),
        "target": "tomorrow_readiness_score",
        "features_used": features,
        "best_model": comparison["best_model_name"],
        "model_results": comparison["results"]
    }


# --------------------------------------------------
# Endpoint: compare models + predict tomorrow
# --------------------------------------------------

@app.get("/predict-readiness")
def predict_readiness(user_id: str):
    df = load_user_data(user_id)

    if df.empty:
        return {"error": f"No data found for user_id={user_id}"}

    if len(df) < 7:
        return {
            "error": "Not enough data to predict robustly. Try with at least 7-10 days of history.",
            "rows_found": int(len(df))
        }

    working_df, train_df, X, y, features = prepare_dataset(df)

    if len(train_df) < 6:
        return {
            "error": "Not enough training rows after shifting target. Need more data.",
            "rows_found": int(len(train_df))
        }

    comparison = evaluate_models(X, y)
    if "error" in comparison:
        return comparison

    best_model_name = comparison["best_model_name"]
    best_model_metrics = comparison["results"][0]
    best_model_pipeline = train_best_model(X, y, best_model_name)

    today_features = build_today_features_row(working_df, features)
    predicted_score = float(best_model_pipeline.predict(today_features)[0])
    predicted_recovery_day = classify_recovery_day(predicted_score)
    confidence = build_prediction_confidence(best_model_metrics, len(train_df))
    recommended_action = build_recommended_action(predicted_recovery_day)

    latest_row = working_df.iloc[-1]
    reason = build_prediction_reason(latest_row, working_df)

    return {
        "user_id": user_id,
        "latest_day_used": str(latest_row["day"].date()),
        "history_days": int(len(df)),
        "training_rows": int(len(train_df)),
        "best_model": best_model_name,
        "best_model_metrics": best_model_metrics,
        "predicted_readiness_tomorrow": round(predicted_score),
        "predicted_readiness_tomorrow_raw": round(predicted_score, 2),
        "predicted_label": label_readiness(predicted_score),
        "predicted_recovery_day": predicted_recovery_day,
        "confidence_score": confidence["confidence_score"],
        "confidence_label": confidence["confidence_label"],
        "recommended_action": recommended_action,
        "reason": reason,
        "all_model_results": comparison["results"]
    }
