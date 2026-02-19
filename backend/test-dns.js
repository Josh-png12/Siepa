const dns = require('dns');

dns.resolveSrv('_mongodb._tcp.siepa.wnh3t19.mongodb.net', (err, addresses) => {
  if (err) {
    console.error('Error resolviendo DNS:', err);
  } else {
    console.log('DNS resuelto OK:', addresses);
  }
});