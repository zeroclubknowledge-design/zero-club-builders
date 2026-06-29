const fs = require('fs');

let content = fs.readFileSync('src/routes/app.compose.tsx', 'utf8');

// The file needs a complete rewrite for the block array structure, it's safer to generate a new file.
