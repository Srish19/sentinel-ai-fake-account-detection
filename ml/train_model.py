
import pandas as pd
import numpy as np
import joblib

from pathlib import Path
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    classification_report,
    confusion_matrix
)

BASE_DIR = Path(__file__).resolve().parent

fake_path = BASE_DIR / "fusers.csv"
genuine_path = BASE_DIR / "users.csv"

features = [
    "statuses_count",
    "followers_count",
    "friends_count",
    "favourites_count",
    "listed_count"
]

# 1. Load datasets
fake_df = pd.read_csv(fake_path, low_memory=False)
genuine_df = pd.read_csv(genuine_path, low_memory=False)

print("Fake profiles:", len(fake_df))
print("Genuine profiles:", len(genuine_df))

# 2. Verify required columns
for column in features:
    if column not in fake_df.columns or column not in genuine_df.columns:
        raise ValueError(f"Missing required feature: {column}")

# 3. Assign labels
fake_df["isFake"] = 1
genuine_df["isFake"] = 0

# 4. Combine and clean
df = pd.concat([fake_df, genuine_df], ignore_index=True)
df = df[features + ["isFake"]].copy()

for column in features:
    df[column] = pd.to_numeric(df[column], errors="coerce")

df[features] = df[features].replace([np.inf, -np.inf], np.nan)

# Remove rows with invalid feature values only if all features are missing.
# Remaining missing values will be handled inside the pipeline.
df = df.dropna(subset=["isFake"])
df = df.dropna(subset=features, how="all")

X = df[features]
y = df["isFake"].astype(int)

if y.nunique() != 2:
    raise ValueError("The dataset must contain both fake and genuine profiles.")

print("\nClass distribution:")
print(y.value_counts().rename(index={0: "Genuine", 1: "Fake"}))

# 5. Split data into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

# 6. Build pipeline
model = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("classifier", RandomForestClassifier(
        n_estimators=200,
        random_state=42,
        class_weight="balanced",
        n_jobs=-1
    ))
])

# 7. Train model
model.fit(X_train, y_train)

# 8. Evaluate on the held-out test set
predictions = model.predict(X_test)
probabilities = model.predict_proba(X_test)

# Locate the probability column for class 1 (Fake)
classifier = model.named_steps["classifier"]
fake_class_index = list(classifier.classes_).index(1)
fake_probabilities = probabilities[:, fake_class_index]

print("\n========== TEST SET EVALUATION ==========")
print(f"Accuracy:  {accuracy_score(y_test, predictions):.4f}")
print(f"Precision: {precision_score(y_test, predictions, pos_label=1, zero_division=0):.4f}")
print(f"Recall:    {recall_score(y_test, predictions, pos_label=1, zero_division=0):.4f}")
print(f"F1-score:  {f1_score(y_test, predictions, pos_label=1, zero_division=0):.4f}")

if y_test.nunique() == 2:
    print(f"ROC-AUC:   {roc_auc_score(y_test, fake_probabilities):.4f}")

print("\nConfusion matrix (rows = actual, columns = predicted):")
print("                 Predicted Genuine   Predicted Fake")
print(confusion_matrix(y_test, predictions, labels=[0, 1]))

print("\nClassification report:")
print(classification_report(
    y_test,
    predictions,
    labels=[0, 1],
    target_names=["Genuine", "Fake"],
    zero_division=0
))

# 9. Five-fold cross-validation on the training set
minimum_class_count = y_train.value_counts().min()
folds = min(5, int(minimum_class_count))

if folds >= 2:
    cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42)
    cv_scores = cross_val_score(
        model,
        X_train,
        y_train,
        cv=cv,
        scoring="f1",
        n_jobs=-1
    )
    print(f"\n{folds}-fold CV F1 scores:", np.round(cv_scores, 4))
    print(f"Mean CV F1-score: {cv_scores.mean():.4f}")
else:
    print("\nCross-validation skipped: insufficient examples in a class.")

# 10. Feature importance
importances = classifier.feature_importances_
importance_df = pd.DataFrame({
    "Feature": features,
    "Importance": importances
}).sort_values("Importance", ascending=False)

print("\nFeature importance:")
print(importance_df.to_string(index=False))

# 11. Save model in the same bundle format used by the API
joblib.dump(
    {
        "model": model,
        "features": features
    },
    BASE_DIR / "fake_account_model.pkl"
)

print("\nModel saved successfully!")
