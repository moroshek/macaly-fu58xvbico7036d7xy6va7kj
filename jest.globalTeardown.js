module.exports = async () => {
  // Force garbage collection at the end
  if (global.gc) {
    global.gc();
  }
  
  console.log('Jest global teardown completed');
};
