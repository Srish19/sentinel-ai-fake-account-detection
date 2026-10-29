
const Account = require("../models/account");
const axios = require("axios");

// Create an account
const createAccount = async (req, res) => {
    
try {
    const username = String(req.body.username || "").trim();

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Username is required.",
      });
    }

    const existingAccount = await Account.findOne({
      username: username,
    });

    if (existingAccount) {
      return res.status(409).json({
        success: false,
        message: "Account already added. This username already exists.",
      });
    }

    const account = await Account.create({
      ...req.body,
      username,
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: account,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Account already added. This username already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create account.",
    });
  }
};

// Get all accounts
const getAccounts = async (req, res) => {
    try {
        const accounts = await Account.find().sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: accounts.length,
            data: accounts
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get one account by ID
const getAccount = async (req, res) => {
    try {
        const account = await Account.findById(req.params.id);

        if (!account) {
            return res.status(404).json({
                success: false,
                message: "Account not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: account
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Update an account
const updateAccount = async (req, res) => {
    try {
        const account = await Account.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!account) {
            return res.status(404).json({
                success: false,
                message: "Account not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Account updated successfully",
            data: account
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Delete an account
const deleteAccount = async (req, res) => {
    try {
        const account = await Account.findByIdAndDelete(
            req.params.id
        );

        if (!account) {
            return res.status(404).json({
                success: false,
                message: "Account not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Account deleted successfully"
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Analyze an account using the Python ML API
const analyzeAccount = async (req, res) => {
    try {
        // 1. Find the account in MongoDB
        const account = await Account.findById(req.params.id);

        if (!account) {
            return res.status(404).json({
                success: false,
                message: "Account not found"
            });
        }

        // 2. Map MongoDB account fields to ML model features
        // The model was trained on historical Twitter profile data.
        const features = {
            statuses_count: Number(account.posts ?? 0),
            followers_count: Number(account.followers ?? 0),
            friends_count: Number(account.following ?? 0),
            favourites_count: 0,
            listed_count: 0
        };

        // 3. Request prediction from the Python Flask API
        const mlResponse = await axios.post(
            "http://127.0.0.1:8000/predict",
            features,
            {
                timeout: 10000,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        const prediction = mlResponse.data;
        const fakeProbability = Number(
            prediction.fakeProbability
        );

        // 4. Validate the model response
        if (
            !Number.isFinite(fakeProbability) ||
            fakeProbability < 0 ||
            fakeProbability > 1
        ) {
            return res.status(502).json({
                success: false,
                message:
                    "Python ML API returned an invalid fakeProbability",
                mlResponse: prediction
            });
        }

        // 5. Convert the model probability into a risk score
        const riskScore = Math.round(fakeProbability * 100);

        let riskLevel = "LOW";

        if (fakeProbability >= 0.70) {
            riskLevel = "HIGH";
        } else if (fakeProbability >= 0.40) {
            riskLevel = "MEDIUM";
        }

        // 6. Save the ML analysis in MongoDB
        account.fakeProbability = fakeProbability;
        account.riskScore = riskScore;
        account.riskLevel = riskLevel;

        await account.save();

        // 7. Return the prediction to Postman or the frontend
        return res.status(200).json({
            success: true,
            message: "ML account risk analysis completed",
            analysisType: "machine-learning",
            data: {
                accountId: account._id,
                username: account.username,
                prediction: prediction.prediction,
                isFake: prediction.isFake,
                fakeProbability,
                riskScore,
                riskLevel
            }
        });
    } catch (error) {
        console.error(
            "Account analysis failed:",
            error.response?.data || error.message
        );

        if (error.code === "ECONNREFUSED") {
            return res.status(502).json({
                success: false,
                message:
                    "Cannot connect to Python ML API. Ensure it is running on port 8000."
            });
        }

        if (error.code === "ECONNABORTED") {
            return res.status(504).json({
                success: false,
                message: "Python ML API request timed out."
            });
        }

        if (error.response) {
            return res.status(502).json({
                success: false,
                message: "Python ML API returned an error.",
                details: error.response.data
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message || "Account analysis failed"
        });
    }
};

// Export all controller functions
module.exports = {
    createAccount,
    getAccounts,
    getAccount,
    updateAccount,
    deleteAccount,
    analyzeAccount
};
