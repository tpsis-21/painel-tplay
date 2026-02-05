const app = require('./server');
const findFreePort = require('find-free-port');

findFreePort(3000, (err, freePort) => {
    if (err) throw err;
    app.listen(freePort, () => {
        console.log(`Servidor iniciado na porta ${freePort}`);
    });
});
