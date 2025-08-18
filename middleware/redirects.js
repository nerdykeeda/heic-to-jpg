// middleware/redirects.js
const redirectMiddleware = (req, res, next) => {
  const host = req.get('host');
  const protocol = req.protocol;
  const url = req.url;
  
  // 🚫 CRITICAL: Skip redirects for API endpoints and admin routes
  if (url.startsWith('/convert') || url.startsWith('/api') || url.startsWith('/admin') || url.startsWith('/blog-manager')) {
    return next();
  }
  
  // Force HTTPS (but not on localhost for development)
  if (protocol === 'http' && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return res.redirect(301, `https://${host}${url}`);
  }
  
  // Force non-www (imgtojpg.org instead of www.imgtojpg.org) - but not on localhost
  if (host.startsWith('www.') && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    const newHost = host.replace('www.', '');
    return res.redirect(301, `https://${newHost}${url}`);
  }
  
  // Handle .html extensions and clean URLs
  if (url.endsWith('.html') && url !== '/index.html') {
    const cleanUrl = url.replace('.html', '');
    return res.redirect(301, cleanUrl);
  }
  
  // Handle index.html redirects
  if (url === '/index.html') {
    return res.redirect(301, '/');
  }
  
  // Handle common URL variations
  const urlVariations = {
    '/home': '/',
    '/homepage': '/',
    '/heic-to-jpg': '/heic-to-jpg.html',
    '/png-to-jpg': '/png-to-jpg.html',
    '/webp-to-jpg': '/webp-to-jpg.html',
    '/tiff-to-jpg': '/tiff-to-jpg.html',
    '/svg-to-jpg': '/svg-to-jpg.html',
    '/camera-raw-converter': '/camera-raw-converter.html',
    '/blog': '/blog.html',
    '/about': '/about.html',
    '/contact': '/contact.html',
    '/help': '/help-center.html',
    '/help-center': '/help-center.html',
    '/privacy': '/privacy-policy.html',
    '/privacy-policy': '/privacy-policy.html',
    '/terms': '/terms-of-use.html',
    '/terms-of-use': '/terms-of-use.html'
  };
  
  if (urlVariations[url]) {
    return res.redirect(301, urlVariations[url]);
  }
  
  next();
};

module.exports = redirectMiddleware;
