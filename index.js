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
app.use(express.urlencoded({ extended: false }));
var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
    crypto: {
        secret: mongodb_secret
    }
});
const { database } = require('./databaseConnection');
const userCollection = database.db(mongodb_database).collection('users');
app.set('view engine', 'ejs');

app.use(session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true
}));

app.get('/', (req, res) => {
    res.render("index");
});

app.get('/setBudget', (req, res) => {
    res.render("setBudget");
})

app.post('/settingBudget', async (req, res) => {
    budgetname = req.body.name;
    budgetamount = req.body.amount;
    username = req.session.username;
    const schema = Joi.object(
        {
            budgetname: Joi.string().alphanum().max(20).required(),
            budgetamount: Joi.boolean
        });
    const validationResult = schema.validate({ budgetname, budgetamount});
    const changed =await userCollection.updateOne(
        // Filter criteria to find the document to update
        { username: username },
        // Update operation
        { $addToSet: { categories: { $each: [[{budgetname : budgetname},{budgetamount: budgetamount}]] } } },
        // Options (optional)
     )
     if (changed.modifiedCount== 0){
        console.log("budget already exists");
     }
    res.redirect('/setBudget');
});

app.get('*', (req, res) => {
    res.status(404);
    res.render("404");
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})