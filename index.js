require('dotenv').config();
const express = require("express");
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require("bcrypt");
const saltRounds = 12;

const app = express();
const port = process.env.PORT || 3000;
const Joi = require("joi");
const favicon = require('serve-favicon');
const path = require('path');

app.set('view engine', 'ejs');
app.use(favicon(path.join(__dirname + '/public', 'images', 'logo.ico')));


app.get('/', (req, res)=>{
    res.render("index");
});

app.get('*', (req, res)=>{
    res.status(404);
    res.render("404");
})

app.listen(port, ()=> {
    console.log(`Server is running on port ${port}`);
})