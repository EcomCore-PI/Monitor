var express = require("express");
var router = express.Router();
var slackController = require("../controllers/slackController");

router.post("/alertar", slackController.alertar);

module.exports = router;