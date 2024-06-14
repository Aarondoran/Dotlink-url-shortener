const fastify = require('fastify')({ logger: true });
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const formbody = require('@fastify/formbody');

fastify.register(formbody);

fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/',
});

fastify.register(require('@fastify/view'), {
    engine: {
        handlebars: require('handlebars')
    },
    root: path.join(__dirname, 'public')
});

const baseUrl = 'https://dotlink.glitch.me';
const urlsFilePath = path.join(__dirname, 'urls.json');
const blacklistFilePath = path.join(__dirname, 'blacklist.json');

// Initialize urls.json if it doesn't exist
if (!fs.existsSync(urlsFilePath)) {
    fs.writeFileSync(urlsFilePath, '[]', 'utf-8');
}

// Function to read blacklist terms from the JSON file
const readBlacklist = () => {
    if (fs.existsSync(blacklistFilePath)) {
        const data = fs.readFileSync(blacklistFilePath, 'utf-8');
        return JSON.parse(data).map(term => term.toLowerCase()); // Convert terms to lowercase
    } else {
        return [];
    }
};

// Utility function to read URLs from the JSON file
const readUrls = () => {
    const data = fs.readFileSync(urlsFilePath, 'utf-8');
    return JSON.parse(data);
};

// Utility function to write URLs to the JSON file
const writeUrls = (urls) => {
    fs.writeFileSync(urlsFilePath, JSON.stringify(urls, null, 2), 'utf-8');
};

// Function to ensure URLs have "https://" prefix
const addHttpsPrefix = (url) => {
    if (!/^https?:\/\//i.test(url)) {
        return `https://${url}`;
    }
    return url;
};

// Function to check if URL contains any blacklisted terms
const isBlacklisted = (url) => {
    const blacklist = readBlacklist();
    const lowerCaseUrl = url.toLowerCase(); // Convert URL to lowercase for case-insensitive comparison
    return blacklist.some(term => lowerCaseUrl.includes(term));
};

fastify.get('/', async (request, reply) => {
    return reply.view('/index.html');
});

// Route to create a short URL via HTML form submission
fastify.post('/shorten', async (request, reply) => {
    let { originalUrl } = request.body;
    originalUrl = addHttpsPrefix(originalUrl); // Ensure URL has "https://" prefix

    // Check if URL is blacklisted
    if (isBlacklisted(originalUrl)) {
        return reply.code(400).send('URL contains blacklisted term/phrase');
    }

    const urls = readUrls();

    // Check if the URL has already been shortened
    let url = urls.find(u => u.originalUrl === originalUrl);
    if (url) {
        return reply.view('/done.html', { shortUrl: `${baseUrl}/r/${url.shortUrl}` });
    }

    // Create a new shortened URL
    const shortUrl = shortid.generate();
    url = { originalUrl, shortUrl };
    urls.push(url);
    writeUrls(urls);

    return reply.view('/done.html', { shortUrl: `${baseUrl}/r/${shortUrl}` });
});

// Middleware to check if URL is shortened before accessing done or redirect pages
const checkShortenedUrl = (request, reply, done) => {
    const urls = readUrls();
    const { shortUrl } = request.params;
    const url = urls.find(u => u.shortUrl === shortUrl);

    if (!url) {
        return reply.redirect('/');
    }
    done();
};

fastify.get('/r/:shortUrl', { preHandler: checkShortenedUrl }, async (request, reply) => {
    const urls = readUrls();
    const { shortUrl } = request.params;
    const url = urls.find(u => u.shortUrl === shortUrl);

    if (url) {
        return reply.view('/redirect.hbs', { originalUrl: url.originalUrl });
    }
    return reply.redirect('/');
});

// API route to create a short URL via JSON request
fastify.post('/api/shorten', async (request, reply) => {
    let { originalUrl } = request.body;
    originalUrl = addHttpsPrefix(originalUrl); // Ensure URL has "https://" prefix

    // Check if URL is blacklisted
    if (isBlacklisted(originalUrl)) {
        return reply.send({
            error: 'URL contains blacklisted term/phrase'
        });
    }

    const urls = readUrls();

    // Check if the URL has already been shortened
    let url = urls.find(u => u.originalUrl === originalUrl);
    if (url) {
        return reply.send({
            shortUrl: `${baseUrl}/r/${url.shortUrl}`,
            error: ''
        });
    }

    // Create a new shortened URL
    const shortUrl = shortid.generate();
    url = { originalUrl, shortUrl };
    urls.push(url);
    writeUrls(urls);

    return reply.send({
        shortUrl: `${baseUrl}/r/${shortUrl}`,
        error: ''
    });
});

const start = async () => {
    try {
        await fastify.listen(3000);
        fastify.log.info(`Server is running at http://localhost:3000`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
