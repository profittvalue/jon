# Jon's Merch Shop Bot

Discord.js v14 bot for Jon's Merch Shop.

## Features
- `/shop` panel
- Fits and Decals categories
- Automatic product totals
- Quantity + design/details collection
- Cash App / Apple Pay selection
- Private order tickets
- Staff notification
- Close-ticket button

## Setup
1. Install Node.js 18+.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Fill in the Discord IDs and payment info.
5. Run `node deploy-commands.js`.
6. Run `npm start`.

## Railway
Upload the project to GitHub, connect the repo to Railway, add the same environment variables, and set the start command to `npm start`.

## Important
The bot must have permission to:
- View Channels
- Send Messages
- Embed Links
- Manage Channels
- Read Message History

The bot's role should be above the staff role if Discord requires it for the intended permissions.
