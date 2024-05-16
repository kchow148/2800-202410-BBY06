require('dotenv').config();
const express = require("express");
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require("bcrypt");
const saltRounds = 12;
const requestPromise = require('request-promise');


const app = express();
const port = process.env.PORT || 3000;
const expireTime = 1 * 60 * 60 * 1000;

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_secret = process.env.MONGODB_SESSION_SECRET;
const mongodb_database = process.env.MONGODB_DATABASE;
const node_session_secret = process.env.NODE_SESSION_SECRET;
const api_key = process.env.API_KEY;
const api_key_2 = process.env.API_KEY_2
const api_key_3 = process.env.API_KEY_3

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

app.get('/location', (req, res) => {
    res.render("location", { html: '' });
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


app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
})

//Summary Page

// app.get('/summary', (req, res) => {
//     // Sample data object
//     const data = {
//         country: 'Canada',
//         type: 'CPI',
//         period: 'Mar 2024',
//         monthly_rate_pct: 0.63,
//         yearly_rate_pct: 2.9
//     };

//     // Render the summary.ejs file and pass the data object
//     res.render('summary', { data: data });
// });



const axios = require('axios');

app.get('/summary', async (req, res) => {
    try {
        const country = 'Canada';
        const options = {
            url: 'https://api.api-ninjas.com/v1/inflation?country=' + country,
            headers: {
                'X-Api-Key': api_key 
            }
        };

        const inflationResponse = await requestPromise(options);
        const inflationDataArray = JSON.parse(inflationResponse);
        const inflationData = inflationDataArray[0];
        const newsApiKey = api_key_2;
        const newsResponse = await axios.get('https://newsapi.org/v2/everything', {
            params: {
                q: `inflation ${country}`, 
                language: 'en',
                apiKey: newsApiKey,
                excludeSources: 'reuters'
            }
        });
        let newsArticles = newsResponse.data.articles;

        if (newsArticles.length === 0) {
            const generalNewsResponse = await axios.get('https://newsapi.org/v2/everything', {
                params: {
                    q: 'inflation', 
                    language: 'en', 
                    apiKey: newsApiKey,
                    excludeSources: 'reuters' 
                }
            });
            newsArticles = generalNewsResponse.data.articles;
        }

        res.render('summary', { inflationData, newsArticles });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred while fetching data');
    }
});







app.get('*', (req, res) => {
    res.status(404);
    res.render("404");
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})