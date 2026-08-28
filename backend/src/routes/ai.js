const { Router } = require("express");
const { reviewSpending, replyToReview } = require("../services/ai");

module.exports = function aiRoutes() {
    const router = Router();

    // POST /api/ai/review
    router.post("/review", async (req, res) => {
        try {
            const text = await reviewSpending(req.body);
            res.json({ review: text });
        } catch (err) {
            console.error("POST /ai/review error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/ai/reply
    router.post("/reply", async (req, res) => {
        try {
            const { summary, previousReview, userComment } = req.body;
            const text = await replyToReview(summary, previousReview, userComment);
            res.json({ reply: text });
        } catch (err) {
            console.error("POST /ai/reply error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
