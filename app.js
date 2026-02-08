const app = require('./server');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Servidor iniciado em http://${HOST}:${PORT}`);
});
