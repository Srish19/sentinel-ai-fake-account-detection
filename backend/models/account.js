
const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        name: {
            type: String,
            required: true
        },
        followers: {
            type: Number,
            required: true,
            min: 0
        },
        following: {
            type: Number,
            required: true,
            min: 0
        },
        posts: {
            type: Number,
            required: true,
            min: 0
        },
        accountAgeDays: {
            type: Number,
            required: true,
            min: 0
        },
        engagementRate: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        profileCompleteness: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        verified: {
            type: Boolean,
            default: false
        },
        profileImage: {
            type: Boolean,
            default: false
        },
        riskScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
},
riskLevel: {
    type: String,
    enum: ["LOW", "MEDIUM", "HIGH"],
    default: "LOW"
},
        
        fakeProbability: {
            type: Number,
            default: 0,
            min: 0,
            max: 1
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Account", accountSchema);
