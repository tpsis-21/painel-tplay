const app = require('./server');
const PORT = process.env.PORT || 3000;

// O Node.js Selector da Hostinger espera que o servidor seja iniciado
// e muitas vezes injeta a variável PORT ou usa um socket Unix.

app.listen(PORT, () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
});
