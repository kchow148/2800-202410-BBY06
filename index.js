require('dotenv').config();
const express = require("express");
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require("bcrypt");
const saltRounds = 12;
const favicon = require('serve-favicon');
const path = require('path');
const api_key = process.env.API_KEY;
const api_key_2 = process.env.API_KEY_2
const requestPromise = require('request-promise');


const app = express();
app.use(express.static(__dirname + '/public'));

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
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}`,
    crypto: {
        secret: mongodb_secret
    }
});
const { database } = require('./databaseConnection');
const { Console } = require('console');
const userCollection = database.db(mongodb_database).collection('users');
const expenseCollection = database.db(mongodb_database).collection('expenses');
const investmentCollection = database.db(mongodb_database).collection('investments');
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

async function updatedata(loginID) {
    try {
        // Fetch expenses related to the loginID
        const expensesResult = await expenseCollection.find({ loginID: loginID }).project({ expense: 1 }).toArray();
        if (expensesResult.length === 0 || expensesResult[0].expense === undefined) {
            console.log("Expense empty");
            return 'No expenses found';
        }

        // Fetch budget categories related to the loginID
        const budgetResult = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).toArray();
        if (budgetResult.length === 0 || budgetResult[0].categories === undefined) {
            console.log("No categories found");
            return 'No categories found';
        }

        const budgets = budgetResult[0].categories;
        const now = new Date();
        const dateChange = new Date(now.setMonth(now.getMonth() - 10));
        console.log(`Date change: ${dateChange}`);

        for (let i = 0; i < budgets.length; i++) {
            const budgetCategory = budgets[i].budgetname;
            // Update documents that have the budget category and remove old entries
            const updateResult = await expenseCollection.updateMany(
                { [`${budgetCategory}`]: { $exists: true } },
                { $pull: { [`${budgetCategory}`]: { date: { $lt: dateChange } } } }
            );
            console.log(`Updated ${updateResult.modifiedCount} documents for category ${budgetCategory}`);
        }

        // Additional update for the "expense" field, if necessary
        const expenseUpdateResult = await expenseCollection.updateMany(
            { expense: { $exists: true } },
            { $pull: { expense: { date: { $lt: dateChange } } } }
        );
        console.log(`Updated ${expenseUpdateResult.modifiedCount} documents for general expenses`);

        return 'Data updated successfully';
    } catch (error) {
        console.error('Error updating data:', error);
        throw new Error('Internal server error');
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
    var email = req.body.email;

    var password = req.body.password;

    const existingUser = await userCollection.findOne({ loginID: loginID });
    if (existingUser) {
        var html = "LoginID already taken. Please choose a different one.";
        return res.render("createUser", { html: html });
    }

    const schema = Joi.object({
        loginID: Joi.string().alphanum().max(20).required(),
        email: Joi.string().email().required(),
        password: Joi.string().max(20).required()
    });

    const validationResult = schema.validate({ loginID, email, password });
    if (validationResult.error) {
        console.log(validationResult.error);
        res.redirect("/createUser");
        return;
    }

    var hashedPassword = await bcrypt.hash(password, saltRounds);

    await userCollection.insertOne({ username: username, loginID: loginID, email: email, password: hashedPassword });
    console.log("Inserted user");

    // Set session variables for the new user
    req.session.authenticated = true;
    req.session.loginID = loginID;
    req.session.cookie.maxAge = expireTime;

    var html = "successfully created user";

    res.redirect("/home");
});

app.get('/login', (req, res) => {
    res.render("login");
});

app.get("/passwordReset", (req, res) => {
    res.render("passwordReset");
});

app.post("/changingPassword", async (req, res) => {
    var username = req.body.username;
    var password = req.body.password;

    const schema = Joi.string().max(20).required();
    var hashedPassword = await bcrypt.hash(password, saltRounds);
    await userCollection.updateOne({ username: username }, { $set: { password: hashedPassword } });
    res.redirect("/login");
    return;
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
        const changedata = await updatedata(loginID);
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
app.get('/home', async (req, res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
    }
    loginID = req.session.loginID;
    const result = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).limit(6).toArray();
    if (result[0].categories === undefined) {
        res.render("home", { exist: false });
    }
    else {
        budgets = result[0].categories
        let i = 0;
        let expenses = [];
        for (i = 0; i < budgets.length; i++) {
            var findexpense = budgets[i].budgetname;
            var find = {};
            let total = 0;
            find[findexpense] = 1;
            var expense = await expenseCollection.find({ loginID: loginID }).project(find).toArray();
            if (expense[0] === undefined) {
                expenses.push(total);
            }
            else if (expense[0][findexpense] === undefined) {
                expenses.push(total);
            }
            else {
                let m = 0;
                record = expense[0][findexpense];
                const currentDate = new Date();
                for (m = 0; m < record.length; m++) {
                    if (record[m].date.getMonth() === currentDate.getMonth())
                        total += record[m].price;
                }
                expenses.push(total);

            }
            // console.log(expenses);
        }
        res.render("home", { exist: true, budgets: budgets, expenses: expenses });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
})

app.use('/setBudget', sessionValidation);
app.get('/setBudget', (req, res) => {
    error = req.query.error
    console.log(error);
    res.render("setBudget", { error: error });
})

app.post('/settingBudget', async (req, res) => {
    budgetname = req.body.name;
    budgetamount = req.body.amount;
    loginID = req.session.loginID;
    const result = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).toArray();
    console.log(result[0].categories);
    if (budgetname ==="other") {
        res.redirect("/setBudget/?error=budget already exists");
        return; 
    }
    if (result[0].categories === undefined) {

    } else {
        let i = 0;
        for (i = 0; i < result[0].categories.length; i++) {
            if (result[0].categories[i].budgetname === budgetname) {
                console.log("budget already made");
                res.redirect("/setBudget/?error=budget already exists");
                return;
            }
        }
    };
    const schema = Joi.object(
        {
            budgetname: Joi.string().regex(/^[a-zA-Z0-9-]+$/).max(20).required(),
            budgetamount: Joi.number().required()
        });
    const validationResult = schema.validate({ budgetname, budgetamount });
    if (validationResult.error != null) {
        console.log(validationResult.error.details[0].path[0]);
        var error = validationResult.error.details[0].message;
        res.redirect(`/setBudget/?error=${error}`);
        return
    }
    const changed = await userCollection.updateOne(
        // Filter criteria to find the document to update
        { loginID: loginID },
        // Update operation
        { $addToSet: { categories: { $each: [{ budgetname: budgetname, budgetamount: Number(budgetamount) }] } } },
        // Options (optional)
    )
    res.redirect('/home');
});

app.use('/addExpenses', sessionValidation);
app.get('/addExpenses', async (req, res) => {
    url = req.query.error;
    console.log(url);
    loginID = req.session.loginID
    const result = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).toArray();
    console.log(result[0].categories);
    if (result.length === 0 || result[0].categories === undefined) {
        res.render("addExpenses", { exist: false, error: url })
    }
    else {
        category = result[0].categories;
        res.render("addExpenses", { exist: true, category: category, error: url });
    }
});


app.post('/addingExpenses', async (req, res) => {
    expenses = req.body.expense
    console.log("expenses: " + expenses);
    category = decodeURIComponent(req.body.category);
    console.log("category: " + category);
    price = req.body.price;
    loginID = req.session.loginID;
    const schema = Joi.object(
        {

            expenses: Joi.string().required(),
            price: Joi.number().required()
        });
    const validationResult = schema.validate({ expenses, price });
    if (validationResult.error != null) {
        console.log(validationResult.error.details[0].path[0]);
        var error = validationResult.error.details[0].message;
        console.log(validationResult);
        res.redirect(`/addExpenses/?error=${error}`);
        return;
    }

    objexpense = { expense: expenses, date: new Date(), price: Number(price) };
    catexpense = {};
    catexpense[category] = objexpense;
    console.log("objexpense: " + objexpense);
    if (category != "other") {
        await expenseCollection.findOneAndUpdate(
            { loginID: loginID },
            { $push: catexpense },
            { upsert: true, new: true }
        );
    }
    addexpense = { expense: expenses, date: new Date(), price: Number(price), category: category };
    console.log("addexpense: " + addexpense);
    expense = {};
    expense["expense"] = addexpense;
    await expenseCollection.findOneAndUpdate(
        { loginID: loginID },
        { $push: expense },
        { upsert: true, new: true }
    );
    //------------------------
    //set to true for the sake of testing
    var overspent = false;
    //  let total = 0;
    const result = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).limit(6).toArray();
    if (result[0].categories === undefined) {
        res.render("expenses", { exist: false });
    }
    else {

        budgets = result[0].categories
        let i = 0;
        let expenses = [];
        for (i = 0; i < budgets.length; i++) {
            var findexpense = budgets[i].budgetname;
            var find = {};
            let total = 0;
            find[findexpense] = 1;
            var expense = await expenseCollection.find({ loginID: loginID }).project(find).toArray();
            if (expense[0][findexpense] === undefined) {
                expenses.push(total);
                console.log("[/addingExpenses] total is now: " + total);
            }
            else {
                let m = 0;
                for (m = 0; m < expense[0][findexpense].length; m++) {
                    total += expense[0][findexpense][m].price;
                }
                //console.log("expense[0][findexpense][m].price: " + expense[0][findexpense][m].price);
                expenses.push("expense.push total: " + total);

                // Check if total exceeds budget
                if (total >= budgets[i].budgetamount && category == result[0].categories[i].budgetname) {
                    console.log(`total: ` + total + ` budgets[${i}].budgetamount: ` + budgets[i].budgetamount);
                    console.log(`Budget exceeded for category: ${findexpense}`);
                    overspent = true;
                }
            }
        }
    }
    //------------------------
    if (overspent) {
        // This part needs to be changed to activate the modal
        // res.redirect('/budgetExceeded');
        res.redirect(`/expenses/?overspent=${overspent}`);
    }
    else {
        res.redirect('/addExpenses');
    }
});

app.use('/profilePage', sessionValidation);
app.get('/profilePage', async (req, res) => {
    loginID = req.session.loginID;
    // const result = userCollection.find({loginID : loginID}).project({username:1, loginID: 1, email: 1}).toArray();
    const result = await userCollection.find({ loginID: loginID }).project({ username: 1, loginID: 1, email: 1 }).toArray();
    console.log(result);
    username = result[0].username
    email = result[0].email
    res.render("profilePage", { username: username, loginID: loginID, email: email });
});

//if the user goes over budget, direct to here:
app.get('/budgetExceeded', async (req, res) => {
    res.render("WarningExceedBudget");
});

app.use('/budgets', sessionValidation);
app.get('/budgets', async (req, res) => {
    month = req.query.month
    const currentDate = new Date();
    if (month === undefined) {
        currentMonth = currentDate.getMonth();
    } else {
        if (parseInt(month) === -1) {
            currentMonth = 11;
        } else {
            currentMonth = parseInt(month) % 12
        }
    }
    loginID = req.session.loginID;
    const result = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).toArray();
    //console.log(result);
    if (result[0].categories === undefined) {
        res.render("budgets", { exist: false });
    }
    else {
        budgets = result[0].categories
        let i = 0;
        let expenses = [];
        for (i = 0; i < budgets.length; i++) {
            var findexpense = budgets[i].budgetname;
            var find = {};
            let cat = []
            find[findexpense] = 1;
            var expense = await expenseCollection.find({ loginID: loginID }).project(find).toArray();
            if (expense[0] === undefined) {
                expenses.push(cat);
            }
            else if (expense[0][findexpense] === undefined) {
                expenses.push(cat);
            }
            else {
                let m = 0;
                record = expense[0][findexpense];
                for (m = 0; m < expense[0][findexpense].length; m++) {
                    if (record[m].date.getMonth() === currentMonth) {
                        cat.push(expense[0][findexpense][m]);
                    }
                }
                expenses.push(cat);
            }
        }
        res.render("budgets", { budgets: budgets, expenses: expenses, exist: true });
    }
});

app.use('/expenses', sessionValidation);
app.get('/expenses', async (req, res) => {
    month = req.query.month;
    currentDate = new Date();
    overspent = req.query.overspent;
    loginID = req.session.loginID;
    const result = await expenseCollection.find({ loginID: loginID }).project({ expense: 1 }).toArray();
    if (month === undefined) {
        currentMonth = currentDate.getMonth();
    } else {
        if (parseInt(month) === -1) {
            currentMonth = 11;
        } else {
            currentMonth = parseInt(month) % 12
        }
    }
    console.log(currentMonth)
    if (result.length === 0 || result[0].expense === undefined) {
        res.render("expenses", { exist: false, overspent: overspent, currenMonth: currentMonth })
    }
    else {
        expense = result[0].expense;
        res.render("expenses", { expense: expense, exist: true, currenMonth: currentMonth })
    };
});

app.use('/savings', sessionValidation);
app.get('/savings', async (req, res) => {
    loginID = req.session.loginID;
    const result = await investmentCollection.find({ loginID: loginID }).project({ item: 1, price: 1, year: 1, interest: 1, _id: 1 }).toArray();
    res.render("savings", { investments: result })
})

function calculateTotal(result) {
    let total = 0;
    for (i = 0; i < result[0].expense.length; i++) {
        //console.log("prices: " + result[0].expense[0].price);
        total += parseFloat(result[0].expense[i].price);
    }
    return total;
}

app.use('/investments', sessionValidation);
app.get('/investments', async (req, res) => {
    res.render("investments");
})

app.post('/calculations', async (req, res) => {
    var item = req.body.item;
    var price = parseInt(req.body.price);
    var year = parseInt(req.body.year);
    var interest = parseInt(req.body.interest);
    var loginID = req.session.loginID;
    const schema = Joi.object({
        item: Joi.string().max(20).required(),
        price: Joi.number().max(999999999999).required(),
        year: Joi.number().max(9999).required(),
        interest: Joi.number().max(100).required()
    });

    const validationResult = schema.validate({ item, price, year, interest });

    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.redirect("/investments");
        return;
    }

    var currentYear = 2024;
    var yearDifference = year - currentYear;
    var x = (1 + interest / 100);
    var newPrice = parseFloat((price * (Math.pow(x, yearDifference))).toFixed(2));

    console.log(typeof (newPrice));
    await investmentCollection.insertOne({ item: item, price: newPrice, year: year, loginID: loginID });
    res.render("calculations", { item: item, year: year, price: newPrice, interest: interest });
})

app.get('/deleteInvestment', async (req, res) => {
    var loginID = req.session.loginID;
    var item = req.query.item;
    await investmentCollection.deleteOne({ loginID: loginID, item: item });
    res.redirect("/savings");
})

app.get('/deleteExpense', async (req, res) => {
    var loginID = req.session.loginID;
    var expense = req.query.expense;
    await expenseCollection.deleteOne({ loginID: loginID, expense: expense });
    res.redirect("/expenses");
})


const axios = require('axios');

app.get('/summary', async (req, res) => {
    try {
        const selectedCountry = req.query.country; // Get the selected country from the query parameters
        console.log(selectedCountry);
        // Fetch inflation data for the selected country
        const options = {
            url: `https://api.api-ninjas.com/v1/inflation?country=${selectedCountry}`,
            headers: {
                'X-Api-Key': api_key
            }
        };
        const inflationResponse = await requestPromise(options);
        const inflationDataArray = JSON.parse(inflationResponse);
        const inflationData = inflationDataArray[0];

        // Fetch news articles related to inflation
        const newsApiKey = api_key_2;
        const newsResponse = await axios.get('https://newsapi.org/v2/everything', {
            params: {
                q: `inflation ${selectedCountry}`, // Search for inflation news related to the selected country
                language: 'en',
                apiKey: newsApiKey,
                excludeSources: 'reuters'
            }
        });
        let newsArticles = newsResponse.data.articles;

        if (newsArticles.length === 0) {
            // If no news articles found, fetch general inflation news
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

        // Render the 'summary' template with the fetched data and selected country
        res.render('summary', { selectedCountry, inflationData, newsArticles });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred while fetching data');
    }
});

app.get('/deletebudget', async (req, res) => {
    loginID = req.session.loginID;
    budgetname = req.query.budget;
    const deletebudget = await userCollection.updateOne(
        { loginID: loginID },
        {
            $pull: {
                categories: {
                    budgetname: budgetname
                }
            }
        }
    )
    var expense = budgetname
    const deleteexpense = await expenseCollection.updateOne(
        { loginID: loginID, [expense]: { $exists: true } }, { $unset: { [expense]: '' } }
    )
    res.redirect('/budgets')
});

app.get('*', (req, res) => {
    res.status(404);
    res.render("404");
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})