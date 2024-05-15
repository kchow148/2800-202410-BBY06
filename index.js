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
// const favicon = require('serve-favicon');
// const path = require('path');

app.use(express.urlencoded({ extended: false }));
var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}`,
    crypto: {
        secret: mongodb_secret
    }
});
const { database } = require('./databaseConnection');
const userCollection = database.db(mongodb_database).collection('users');
const expenseCollection = database.db(mongodb_database).collection('expenses');
app.set('view engine', 'ejs');
// app.use(favicon(path.join(__dirname + '/public', 'images', 'logo.ico')));


app.use(session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true
}));

function isValidSession(req) {
    if (req.session.authenticated) {
        return true;
    }
    return false;
}

function sessionValidation(req, res, next) {
    if (isValidSession(req)) {
        next();
    }
    else {
        res.redirect('/login');
    }
}

app.get('/', (req, res) => {
    if (req.session.authenticated) {
        res.render("index");
    } else {
        res.render("index");

    }
});

app.get('/createUser', (req, res) => {
    res.render("createUser", { html: '' });
});


app.post('/submitUser', async (req, res) => {
    var username = req.body.username;
    var loginID = req.body.loginID;
    var password = req.body.password;

    const existingUser = await userCollection.findOne({ loginID: loginID });
    if (existingUser) {
        var html = "LoginID already taken. Please choose a different one.";
        return res.render("createUser", { html: html });
    } 

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

    await userCollection.insertOne({ username: username, loginID: loginID, password: hashedPassword });
    console.log("Inserted user");

    // Set session variables for the new user
    req.session.authenticated = true;
    req.session.loginID = loginID;
    req.session.cookie.maxAge = expireTime;

    var html = "successfully created user";

    res.render("home", { html: html });
});

app.get('/login', (req, res) => {
    res.render("login");
});

app.post('/loggingin', async (req, res) => {
    var loginID = req.body.loginID;
    var password = req.body.password;

    const schema = Joi.string().max(20).required();
    const validationResult = schema.validate(loginID);
    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.redirect("/login");
        return;
    }

    const result = await userCollection.find({ loginID: loginID }).project({ loginID: 1, password: 1, _id: 1 }).toArray();

    console.log(result);
    if (result.length != 1) {
        console.log("user not found");
        res.redirect("/login");
        return;
    }
    if (await bcrypt.compare(password, result[0].password)) {
        console.log("correct password");
        req.session.authenticated = true;
        req.session.loginID = loginID;
        req.session.user_type = result[0].user_type;
        req.session.cookie.maxAge = expireTime;

        res.redirect("/home");
        return;
    }
    else {
        console.log("incorrect password");
        res.redirect("/login");
        return;
    }
});

app.use('/home', sessionValidation);
app.get('/home', (req, res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
    }
    res.render("home");
});


app.get('/logout', (req,res) => {
    req.session.destroy();
    res.redirect('/');
})

app.get('/setBudget', (req, res) => {
    res.render("setBudget");
})

app.post('/settingBudget', async (req, res) => {
    budgetname = req.body.name;
    budgetamount = req.body.amount;
    loginID = req.session.loginID;
    console.log(loginID)
    const schema = Joi.object(
        {
            budgetname: Joi.string().alphanum().max(20).required(),
            budgetamount: Joi.boolean
        });
    const validationResult = schema.validate({ budgetname, budgetamount});
    const changed =await userCollection.updateOne(
        // Filter criteria to find the document to update
        { loginID: loginID },
        // Update operation
        { $addToSet: { categories: { $each: [{budgetname : budgetname, budgetamount: budgetamount}] } } },
        // Options (optional)
     )
     if (changed.modifiedCount== 0){
        console.log("budget already exists");
     }
    res.redirect('/setBudget');
});

app.get('/addExpenses', (req, res) => {
    res.render("addExpenses");
});

app.post('/addingExpenses', async (req, res) => {
    expense = req.body.expense
    category = req.body.category;
    price = req.body.price;
    loginID = req.session.loginID;
    objexpense = { expense: "expense", date: "date", price: price };
    catexpense = {};
    catexpense[category] = objexpense;
    await expenseCollection.findOneAndUpdate(
        { loginID: loginID },
        { $push: catexpense },
        { upsert: true, new: true }
    );
    addexpense = { expense: "expense", date: "date", price: price, category: category };
    expense = {};
    expense["expense"] = addexpense;
    await expenseCollection.findOneAndUpdate(
        { loginID: loginID },
        { $push: expense },
        { upsert: true, new: true }
    );
    res.redirect('/addExpenses');
});

app.get('*', (req, res) => {
    res.status(404);
    res.render("404");
})

app.listen(port, ()  => {
    console.log(`Server is running on port ${port}`);
})