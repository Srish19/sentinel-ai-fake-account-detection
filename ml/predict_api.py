
from flask import Flask, request, jsonify
from pathlib import Path
import pandas as pd
import joblib

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "fake_account_model.pkl"

saved = joblib.load(MODEL_PATH)
model = saved["model"]
features = saved["features"]


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "success": True,
        "message": "Fake profile ML service is running"
    })


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "Send a JSON object"
        }), 400

    missing = [feature for feature in features if feature not in data]

    if missing:
        return jsonify({
            "success": False,
            "message": "Missing required features",
            "missing": missing
        }), 400

    try:
        row = {}

        for feature in features:
            value = float(data[feature])

            if not pd.notna(value) or abs(value) == float("inf"):
                raise ValueError(f"Invalid value for {feature}")

            row[feature] = value

        X = pd.DataFrame([row], columns=features)

        prediction = int(model.predict(X)[0])
        probabilities = model.predict_proba(X)[0]

        fake_index = list(model.classes_).index(1)
        fake_probability = float(probabilities[fake_index])

        return jsonify({
            "success": True,
            "prediction": "FAKE" if prediction == 1 else "GENUINE",
            "isFake": prediction,
            "fakeProbability": round(fake_probability, 4),
            "model": "RandomForestClassifier"
        })

    except (TypeError, ValueError) as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 400


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=False)
