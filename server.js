const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const xlsx = require('xlsx');
const app = express();
const port = process.env.PORT || 3000; // Use Render's PORT environment variable

// Enable CORS for the frontend domain
app.use(cors({ origin: 'https://cmdf.onrender.com' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Route for index1.html and signup.html
app.get('/index1.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index1.html'));
});

app.get('/signup.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Ensure data directory exists for persistent files
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Function to read Excel data
function readExcelData(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            const workbook = xlsx.utils.book_new();
            const worksheet = xlsx.utils.json_to_sheet([]);
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
            xlsx.writeFile(workbook, filePath);
        }
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet);
        return jsonData;
    } catch (error) {
        console.error('Error reading Excel file:', error.message);
        return [];
    }
}

// Function to append data to Excel file
function appendToExcel(filePath, data) {
    let workbook;
    let worksheet;

    if (fs.existsSync(filePath)) {
        workbook = xlsx.readFile(filePath);
        worksheet = workbook.Sheets[workbook.SheetNames[0]];
    } else {
        workbook = xlsx.utils.book_new();
        worksheet = xlsx.utils.json_to_sheet([]);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Signups');
    }

    const existingData = xlsx.utils.sheet_to_json(worksheet);
    existingData.push(data);
    const newWorksheet = xlsx.utils.json_to_sheet(existingData);
    workbook.Sheets[workbook.SheetNames[0]] = newWorksheet;

    xlsx.writeFile(workbook, filePath);
}

// Define a simple route
app.get('/', (req, res) => {
    res.send('hello,world!');
});

// Handle signup data
app.post('/signup', (req, res) => {
    const { firstName, email, phone, signupDate, timeZone } = req.body;

    if (!firstName || !email || !phone) {
        return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    const signupData = {
        'First Name': firstName,
        'Email': email,
        'Phone': phone,
        'Signup Date': signupDate || new Date().toLocaleString(),
        'Time Zone': timeZone || 'Unknown'
    };

    try {
        const excelFilePath = path.join(__dirname, 'data', 'signups.xlsx');
        appendToExcel(excelFilePath, signupData);
        res.json({ success: true, message: 'Signup recorded successfully' });
    } catch (error) {
        console.error('Error saving signup data:', error.message);
        res.status(500).json({ success: false, error: 'Error saving signup data' });
    }
});

// Handle file uploads and analyze resume
app.post('/upload', upload.single('resume'), async (req, res) => {
    console.log('File received:', req.file);
    const jobRole = req.body.jobRole;

    if (!req.file) {
        console.error('No file uploaded');
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const filePath = path.join(__dirname, req.file.path);
        let dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        let resumeText = data.text;

        const excelData = readExcelData(path.join(__dirname, 'data', 'jobrolespskillsframeworks.xlsx'));
        let analysisResult = analyzeResume(resumeText, jobRole, excelData);

        const response = {
            jobRole: jobRole,
            probability: analysisResult.probability,
            additionalSkills: analysisResult.additionalSkills,
            additionalFrameworks: analysisResult.additionalFrameworks,
            feedback: analysisResult.feedback,
        };

        fs.unlinkSync(filePath);
        res.json(response);
    } catch (error) {
        console.error('Error processing request:', error.message);
        res.status(500).json({ error: 'Error processing request' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

// Function to analyze resume text
function analyzeResume(resumeText, jobRole, excelData) {
    const jobData = excelData.find(item => item['JOB ROLES'] === jobRole);
    if (!jobData) {
        return {
            jobRole,
            probability: 0,
            additionalSkills: 'Job role not found in the dataset',
            additionalFrameworks: 'Job role not found in the dataset',
            feedback: 'Job role not found in the dataset',
        };
    }

    const requiredSkills = jobData['PROGRAMMING SKILLS'].split(',').map(skill => skill.trim());
    const requiredFrameworks = jobData['FRAMEWORKS'].split(',').map(framework => framework.trim());
    const skillsFound = [];
    const frameworksFound = [];
    const additionalSkills = [];
    const additionalFrameworks = [];
    let probability = 0;
    let feedback = 'Better luck next time. Consider improving your skills in certain areas.';

    requiredSkills.forEach(skill => {
        if (resumeText.toLowerCase().includes(skill.toLowerCase())) {
            skillsFound.push(skill);
        } else {
            additionalSkills.push(skill);
        }
    });

    requiredFrameworks.forEach(framework => {
        if (resumeText.toLowerCase().includes(framework.toLowerCase())) {
            frameworksFound.push(framework);
        } else {
            additionalFrameworks.push(framework);
        }
    });

    const skillsProbability = (skillsFound.length / requiredSkills.length) * 50;
    const frameworksProbability = (frameworksFound.length / requiredFrameworks.length) * 50;
    probability = skillsProbability + frameworksProbability;

    if (probability === 100) {
        feedback = 'Great job! You are a perfect match for this role!';
    } else if (probability >= 50) {
        feedback = 'You have some of the required skills and frameworks. Consider improving the following areas: ' + additionalSkills.join(', ') + ', ' + additionalFrameworks.join(', ');
    } else {
        feedback = 'You need to improve your skills and frameworks significantly. Consider learning: ' + additionalSkills.join(', ') + ', ' + additionalFrameworks.join(', ');
    }

    return {
        jobRole,
        probability,
        additionalSkills: additionalSkills.join(', ') || 'None',
        additionalFrameworks: additionalFrameworks.join(', ') || 'None',
        feedback,
    };
}