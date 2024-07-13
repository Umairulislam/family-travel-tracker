import express from "express"
import bodyParser from "body-parser"
import pg from "pg"
import dotenv from "dotenv"

// Load environment variables from .env file
dotenv.config()

// Set up the express app
const app = express()
const port = 3000

// PostgreSQL client setup
const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
})
db.connect()

// Middleware
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static("public"))

let currentUserId = 1
let users = [{ id: 1, name: "Angela", color: "teal" }]

// Function to check visited countries
const checkVisited = async () => {
  if (currentUserId) {
    const result = await db.query(
      "SELECT country_code FROM visited_countries WHERE user_id = $1",
      [currentUserId]
    )
    return result.rows.map((country) => country.country_code)
  }
  return [] // Return empty array if no user is selected
}

// Function to get the current user
const getCurrentUser = async () => {
  const result = await db.query("SELECT * FROM users")
  users = result.rows
  if (users.length > 0) {
    return users.find((user) => user.id == currentUserId)
  } else {
    // Provide default user if no users are found
    return { id: null, name: "No User", color: "#000000" }
  }
}

// GET Home page
app.get("/", async (req, res) => {
  const countries = await checkVisited()
  const currentUser = await getCurrentUser()
  console.log(`Current user: ${currentUser.name}`)
  console.log(`Visited countries: ${countries}`)

  res.render("index.ejs", {
    countries: countries,
    total: countries.length,
    users: users,
    color: currentUser.color,
  })
})

// POST add new country
app.post("/add", async (req, res) => {
  const input = req.body.country
  const currentUser = await getCurrentUser()
  console.log(`Adding country: ${input}`)

  try {
    const countryQueryRes = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE $1",
      [`%${input.toLowerCase()}%`]
    )
    // Check if the country name exists
    if (countryQueryRes.rows.length === 0) {
      throw new Error("Country name does not exist")
    }

    const countryCode = countryQueryRes.rows[0].country_code

    // Check if the country has already been added
    const visitedQueryRes = await db.query(
      "SELECT * FROM visited_countries WHERE country_code = $1 AND user_id = $2",
      [countryCode, currentUserId]
    )
    if (visitedQueryRes.rows.length > 0) {
      throw new Error("Country has already been added, try again.")
    }

    db.query(
      "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2)",
      [countryCode, currentUserId]
    )
    console.log(`Country code ${countryCode} added to user ${currentUserId}`)

    res.redirect("/")
  } catch (err) {
    const errorMessage =
      err.message === "Country name does not exist"
        ? err.message
        : "Country has already been added, try again."
    console.log(`Error: ${errorMessage}`)

    const countries = await checkVisited()
    res.render("index.ejs", {
      countries: countries,
      total: countries.length,
      users: users,
      color: currentUser.color,
      errorAdd: errorMessage,
    })
  }
})

// POST select user or add new user
app.post("/user", async (req, res) => {
  if (req.body.add === "new") {
    res.render("new.ejs")
  } else {
    currentUserId = req.body.user
    res.redirect("/")
  }
})

// POST add new user
app.post("/new", async (req, res) => {
  const name = req.body.name
  const color = req.body.color

  try {
    const result = await db.query(
      "INSERT INTO users (name, color) VALUES ($1, $2) RETURNING *",
      [name, color]
    )
    currentUserId = result.rows[0].id
    console.log(
      `New user added with id: ${currentUserId}, name: ${name}, color: ${color}`
    )
    res.redirect("/")
  } catch (err) {
    console.log(err)
  }
})

// POST delete country for current user
app.post("/delete", async (req, res) => {
  const input = req.body.country
  const currentUser = await getCurrentUser()

  try {
    const countryQueryRes = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE $1",
      [`%${input.toLowerCase()}%`]
    )
    // Check if the country name exists
    if (countryQueryRes.rows.length === 0) {
      throw new Error("Country name does not exist")
    }

    const countryCode = countryQueryRes.rows[0].country_code
    await db.query(
      "DELETE FROM visited_countries WHERE country_code = $1 AND user_id = $2",
      [countryCode, currentUserId]
    )
    console.log(
      `Country code ${countryCode} deleted from user ${currentUserId}`
    )
    res.redirect("/")
  } catch (err) {
    const errorMessage =
      err.message === "Country name does not exist"
        ? err.message
        : "Country has already been added, try again."
    console.log(`Error: ${errorMessage}`)

    const countries = await checkVisited()
    res.render("index.ejs", {
      countries: countries,
      total: countries.length,
      users: users,
      color: currentUser.color,
      errorDel: errorMessage,
    })
  }
})

// POST delete user
app.post("/deleteUser", async (req, res) => {
  const userID = req.body.user

  try {
    await db.query("DELETE FROM visited_countries WHERE user_id = $1", [userID])
    await db.query("DELETE FROM users WHERE id = $1", [userID])
    console.log(`User with id ${userID} deleted`)
    // Set current user to the first user in the list
    currentUserId = users[0].id
    res.redirect("/")
  } catch (error) {
    console.log(error)
  }
})

// Listen the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
