module.exports = async function handler(req, res) {
  res.status(200).json({
    status: "ok",
    service: "personi-mcp",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
};
