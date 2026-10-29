
import pandas as pd
from pathlib import Path

file_path = Path(__file__).resolve().parent / "fusers.csv"

df = pd.read_csv(file_path, low_memory=False)

print("\n--- DATASET SHAPE ---")
print("Rows:", df.shape[0])
print("Columns:", df.shape[1])

print("\n--- COLUMN NAMES ---")
print(df.columns.tolist())

print("\n--- FIRST 5 ROWS ---")
print(df.head().to_string())

print("\n--- DATA TYPES ---")
print(df.dtypes.to_string())

print("\n--- MISSING VALUES ---")
print(df.isnull().sum().to_string())

print("\n--- POSSIBLE LABEL COLUMNS ---")
for column in df.columns:
    name = str(column).lower()
    if any(word in name for word in ["fake", "label", "class", "target", "bot", "status"]):
        print(f"\nColumn: {column}")
        print(df[column].value_counts(dropna=False).head(20))
