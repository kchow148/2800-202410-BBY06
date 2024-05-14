require('dotenv').config();
const express = require("express");
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require("bcrypt");
const saltRounds = 12;

const app = express();
const port = process.env.PORT || 3000;
const expireTime = 1 * 60 * 60 * 1000;

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_secret = process.env.MONGODB_SESSION_SECRET;
const mongodb_database = process.env.MONGODB_DATABASE;
const node_session_secret = process.env.NODE_SESSION_SECRET;
const Joi = require("joi");
const favicon = require('serve-favicon');
const path = require('path');

app.use(express.urlencoded({ extended: false }));
var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}`,
    crypto: {
        secret: mongodb_secret
    }
});
const { database } = require('./databaseConnection');
const userCollection = database.db(mongodb_database).collection('users');
app.set('view engine', 'ejs');
app.use(favicon(path.join(__dirname + '/public', 'images', 'logo.ico')));


app.use(session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true
}));

app.get('/', (req, res)=>{
    res.render("index");
});

app.get('/createUser', (req, res) => {
    res.render("createUser");
});

app.post('/submitUser', async (req, res) => {
    var username = req.body.username;
    var loginID = req.body.loginID;
    var password = req.body.password;

    const schema = Joi.object({
        loginID: Joi.string().alphanum().max(20).required(),
        password: Joi.string().max(20).required()
    });

    const validationResult = schema.validate({ loginID, password });
    if (validationResult.error) {
        console.log(validationResult.error);
        res.redirect("/createUser");
        return;
    }

    var hashedPassword = await bcrypt.hash(password, saltRounds);

    await userCollection.insertOne({ username: username, loginID: loginID, password: hashedPassword});
    console.log("Inserted user");

    // Set session variables for the new user
    req.session.authenticated = true;
    req.session.loginID = loginID;
    req.session.cookie.maxAge = expireTime;

    var html = "successfully created user";

    res.render("home", { html: html });
});

app.get('*', (req, res)=>{
    res.status(404);
    res.render("404");
})

app.listen(port, ()=> {
    console.log(`Server is running on port ${port}`);
})