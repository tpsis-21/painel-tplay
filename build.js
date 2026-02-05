const { rebuildAll } = require('./server');

rebuildAll()
    .then(() => {
        console.log('Processo de build concluído com sucesso.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Ocorreu um erro durante o processo de build:', err);
        process.exit(1);
    });
