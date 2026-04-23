const fs = require('fs');

// Read the file
const filePath = 'server/routes/transfers.js';
let content = fs.readFileSync(filePath, 'utf8');

// Fix the missing $ in the SQL parameter
const brokenLine = 'query += ` AND (t.from_location_id = ANY(${paramCount}) OR t.to_location_id = ANY(${paramCount}))`;';
const fixedLine = 'query += ` AND (t.from_location_id = ANY($${paramCount}) OR t.to_location_id = ANY($${paramCount}))`;';

if (content.includes(brokenLine)) {
  content = content.replace(brokenLine, fixedLine);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Fixed SQL parameter placeholder');
} else if (content.includes(fixedLine)) {
  console.log('✅ SQL parameter already correct!');
} else {
  console.log('❌ Could not find the line to fix');
}
