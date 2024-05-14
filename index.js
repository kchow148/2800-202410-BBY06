require('dotenv').config();
const express = require("express");
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require("bcrypt");
const saltRounds = 12;

const app = express();
const port = process.env.PORT || 3000;
const Joi = require("joi");

app.listen(port, ()=> {
    console.log(`Server is running on port ${port}`);
})