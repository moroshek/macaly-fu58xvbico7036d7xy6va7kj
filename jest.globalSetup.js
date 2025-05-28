module.exports = async () => {
  // Enable garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Set Node.js memory optimization flags
  process.env.NODE_OPTIONS = '--max-old-space-size=4096 --expose-gc --no-compilation-cache';
  
  console.log('Jest global setup completed with memory optimizations');
};
