const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

convertDbObjectToResponseObject = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.dateTime,
  };
};

convertDbToResponse = (eachName) => {
  return {
    name: eachName.name,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
        INSERT INTO 
            user (name, username, password, gender) 
        VALUES 
            (
            '${name}',
            '${username}',
            '${hashedPassword}', 
            '${gender}'
            )`;
      const dbResponse = await database.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  getUserTweetQuery = `
    SELECT 
        (SELECT 
            username
        FROM
            user
        WHERE
            user_id = tweet.user_id
        ) AS username,
        tweet.tweet AS tweet,
        tweet.date_time AS dateTime
    FROM
        user 
        INNER JOIN follower ON user.user_id = follower.follower_user_id
        INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE
        user.username = "${username}"
    ORDER BY
        tweet.date_time DESC
    LIMIT 4;`;

  const userTweetsArray = await database.all(getUserTweetQuery);
  response.send(
    userTweetsArray.map((eachTweet) =>
      convertDbObjectToResponseObject(eachTweet)
    )
  );
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserFollowersQuery = `
    SELECT
        (SELECT 
            name
        FROM
            user
        WHERE 
            follower.following_user_id = user.user_id) AS name
    FROM 
        user
        INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE
        user.username = "${username}";`;
  const nameArray = await database.all(getUserFollowersQuery);
  response.send(nameArray.map((eachName) => convertDbToResponse(eachName)));
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserFollowersQuery = `
    SELECT
        (SELECT 
            name
        FROM
            user
        WHERE 
            follower.follower_user_id = user.user_id) AS name
    FROM 
        user
        INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE
        user.username = "${username}";`;
  const nameArray = await database.all(getUserFollowersQuery);
  response.send(nameArray.map((eachName) => convertDbToResponse(eachName)));
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getTweetQuery = `
    SELECT
        tweet.tweet AS tweet,
        COUNT(like.tweet_id) AS likes,
        COUNT(reply.tweet_id) AS replies,
        tweet.date_time AS dateTime
    FROM
        tweet
        INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
        INNER JOIN like ON like.tweet_id = tweet.tweet_id
    WHERE 
        tweet.tweet_id = ${tweetId}
    GROUP BY
        tweet.tweet_id;`;
  const tweet = await database.get(getTweetQuery);
  if (tweet !== undefined) {
    response.send({
      tweet: tweet[tweet],
      likes: tweet[likes],
      replies: tweet[replies],
      dateTime: tweet[dateTime],
    });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getTweetQuery = `
    SELECT
        (SELECT 
            username
        FROM
            user
        WHERE
            user_id = like.user_id ) AS likes
    FROM
        user 
        INNER JOIN follower ON follower.follower_user_id = user.user_id
        INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        INNER JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE 
        user.username = "${username}"
        AND tweet.tweet_id = ${tweetId}
    GROUP BY tweet.tweet_id;`;
    const tweet = await database.all(getTweetQuery);
    if (tweet !== undefined) {
      response.send({
        likes: tweet[likes],
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getTweetQuery = `
    SELECT
        (SELECT username FROM user WHERE reply.user_id = user_id) AS name,
        reply.reply AS reply
    FROM
        user 
        INNER JOIN follower ON follower.follower_user_id = user.user_id
        INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE 
        user.username = "${username}"
        AND tweet.tweet_id = ${tweetId}
    GROUP BY tweet.tweet_id;`;
    const tweet = await database.all(getTweetQuery);
    if (tweet !== undefined) {
      response.send({
        replies: tweet,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getTweetQuery = `
    SELECT
        tweet.tweet AS tweet,
        COUNT(like.tweet_id) AS likes,
        COUNT(reply.tweet_id) AS replies,
        tweet.date_time AS dateTime
    FROM
        user
        INNER JOIN tweet ON user.user_id = tweet.user_id
        INNER JOIN like ON tweet.tweet_id = like.tweet_id
        INNER JOIN reply ON tweet.tweet_id = tweet.tweet_id
    WHERE 
        user.user_id = "${username}"
    GROUP BY
        tweet.tweet_id;`;
  const tweet = await database.all(getTweetQuery);
  if (tweet !== undefined) {
    response.send({
      tweet: tweet[tweet],
      likes: tweet[likes],
      replies: tweet[replies],
      dateTime: tweet[dateTime],
    });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  postTweetQuery = `
    INSERT INTO
        tweet( tweet )
    VALUES
        ("${tweet}");`;
  await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserQuery = `SELECT user_id FROM user WHERE username = "${username}";`;
    const { userId } = database.get(getUserQuery);
    const tweetUserQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`;
    const { tweetUserId } = database.get(tweetUserQuery);
    if (userId !== tweetUserId) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteDistrictQuery = `
    DELETE FROM
        tweet
    WHERE
        tweet.user_id = (SELECT user_id FROM user WHERE username = "${username}")
        AND tweet_id = "${tweetId}";`;
      deleteTweet = await database.run(deleteDistrictQuery);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
