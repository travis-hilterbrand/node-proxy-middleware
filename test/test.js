var connect = require('connect');
var assert = require('assert');
var proxy = require('../');
var fs = require('fs');
var url = require('url');
var path = require('path');
var http = require('http');
var exec = require('child_process').exec;
var serveStatic = require('serve-static');
var key = fs.readFileSync(path.join(__dirname, "server.key"));
var cert = fs.readFileSync(path.join(__dirname, "server.crt"));
var describe = global.describe;
var it = global.it;

describe("proxy", function() {
  it("http -> https", function(done) {
    testWith('http', 'https', done);
  });

  it("https -> http", function(done) {
    testWith('https', 'http', done);
  });

  it("http -> http", function(done) {
    testWith('http', 'http', done);
  });

  it("https -> https", function(done) {
    testWith('https', 'https', done);
  });

  it("Can still proxy empty requests if the request stream has ended.", function(done) {
    var destServer = createServerWithLibName('http', function(req, resp) {
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var app = connect();
    //serveStatic causes the incoming request stream to be ended for GETs.
    app.use(serveStatic(path.resolve('.')));
    app.use('/foo', proxy(url.parse('http://localhost:8001/')));

    destServer.listen(8001, 'localhost', function() {
      app.listen(8000);
      http.get('http://localhost:8000/foo/test/', function(res) {
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.on('end', function () {
          assert.strictEqual(data, '/test/');
          destServer.close();
          done();
        });
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("can proxy just the given route.", function(done) {
    var destServer = createServerWithLibName('http', function(req, resp) {
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8003/');
    proxyOptions.route = '/foo';

    var app = connect();
    app.use(serveStatic(path.resolve('.')));
    app.use(proxy(proxyOptions));

    destServer.listen(8003, 'localhost', function() {
      app.listen(8002);
      http.get('http://localhost:8002/foo/test/', function(res) {
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.on('end', function () {
          assert.strictEqual(data, '/test/');
          destServer.close();
          done();
        });
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("Can proxy just the given route with query.", function(done) {
    var destServer = createServerWithLibName('http', function(req, resp) {
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8021');
    proxyOptions.route = '/foo';

    var app = connect();
    app.use(serveStatic(path.resolve('.')));
    app.use(proxy(proxyOptions));

    destServer.listen(8021, 'localhost', function() {
      app.listen(8022);
      http.get('http://localhost:8022/foo?baz=true', function(res) {
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.on('end', function () {
          assert.strictEqual(data, '/?baz=true');
          destServer.close();
          done();
        });
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("can proxy an exact url.", function(done) {
    var destServer = createServerWithLibName('http', function(req, resp) {
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8074/foo');
    proxyOptions.route = '/foo';

    var app = connect();
    app.use(serveStatic(path.resolve('.')));
    app.use(proxy(proxyOptions));

    destServer.listen(8074, 'localhost', function() {
      app.listen(8075);
      http.get('http://localhost:8075/foo', function(res) {
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.on('end', function () {
          assert.strictEqual(data, '/foo');
          destServer.close();
          done();
        });
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("Can proxy url with query.", function(done) {
    var destServer = createServerWithLibName('http', function(req, resp) {
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8028/foo-bar');
    proxyOptions.route = '/foo-bar';

    var app = connect();
    app.use(serveStatic(path.resolve('.')));
    app.use(proxy(proxyOptions));

    destServer.listen(8028, 'localhost', function() {
      app.listen(8029);
      http.get('http://localhost:8029/foo-bar?baz=true', function(res) {

        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.on('end', function () {
          assert.strictEqual(data, '/foo-bar?baz=true');
          destServer.close();
          done();
        });
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("Does not keep header data across requests.", function(done) {
    var headerValues = ['foo', 'bar'];
    var reqIdx = 0;

    var destServer = createServerWithLibName('http', function(req, resp) {
      assert.strictEqual(req.headers['some-header'], headerValues[reqIdx]);
      reqIdx++;
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var app = connect();
    app.use(proxy(url.parse('http://localhost:8005/')));

    destServer.listen(8005, 'localhost', function() {
      app.listen(8004);

      var options = url.parse('http://localhost:8004/foo/test/');

      //Get with 0 content length, then 56;
      options.headers = {'some-header': headerValues[0]};
      http.get(options, function () {

        options.headers['some-header'] = headerValues[1];
        http.get(options, function () {
          destServer.close();
          done();
        }).on('error', function () {
          assert.fail('Request proxy failed');
        });

      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("correctly applies the via header to the request", function(done) {

    var destServer = createServerWithLibName('http', function(req, resp) {
      assert.strictEqual(req.headers.via, '1.1 my-proxy-name');
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8015/');
    proxyOptions.via = 'my-proxy-name';
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8015, 'localhost', function() {
      app.listen(8014);

      var options = url.parse('http://localhost:8014/foo/test/');

      http.get(options, function () {
        // ok...
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("correctly applies the via header to the request where the request has an existing via header", function(done) {

    var destServer = createServerWithLibName('http', function(req, resp) {
      assert.strictEqual(req.headers.via, '1.0 other-proxy-name, 1.1 my-proxy-name');
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8025/');
    proxyOptions.via = 'my-proxy-name';
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8025, 'localhost', function() {
      app.listen(8024);

      var options = url.parse('http://localhost:8024/foo/test/');
      options.headers = {via: '1.0 other-proxy-name'};

      http.get(options, function () {
        // ok...
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("correctly applies the via header to the response", function(done) {

    var destServer = createServerWithLibName('http', function(req, resp) {
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8035/');
    proxyOptions.via = 'my-proxy-name';
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8035, 'localhost', function() {
      app.listen(8034);

      var options = url.parse('http://localhost:8034/foo/test/');

      http.get(options, function (res) {
        assert.strictEqual('1.1 my-proxy-name', res.headers.via);
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("correctly applies the via header to the response where the response has an existing via header", function(done) {

    var destServer = createServerWithLibName('http', function(req, resp) {
      resp.statusCode = 200;
      resp.setHeader('via', '1.0 other-proxy-name');
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8045/');
    proxyOptions.via = 'my-proxy-name';
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8045, 'localhost', function() {
      app.listen(8044);

      var options = url.parse('http://localhost:8044/foo/test/');

      http.get(options, function (res) {
        assert.strictEqual('1.0 other-proxy-name, 1.1 my-proxy-name', res.headers.via);
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("correctly applies the location header to the response when the response status code is 3xx", function(done) {
    var destServer = createServerWithLibName('http', function(req, resp) {
      resp.statusCode = 302;
      resp.setHeader('location', 'http://localhost:8055/foo/redirect/');
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8055/');
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8055, 'localhost', function() {
      app.listen(8054);

      var options = url.parse('http://localhost:8054/foo/test/');

      http.get(options, function (res) {
        assert.strictEqual(res.headers.location, '/foo/redirect/');
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    })
  });


  it("correctly rewrites the cookie domain for set-cookie headers", function(done) {
    var cookie1 = function(host) { return 'cookie1=value1; Expires=Fri, 01-Mar-2019 00:00:01 GMT; Path=/; Domain=' + host + '; HttpOnly'; };
    var cookie2 = function(host) { return 'cookie2=value2; Expires=Fri, 01-Mar-2019 00:00:01 GMT; Domain=' + host + '; Path=/test/'; };
    var cookie3 = function(host) { return 'cookie3=value3'; };
    var cookie4 = function(host) { return 'cookie4=value4; Expires=Fri, 01-Mar-2019 00:00:01 GMT; Domain=' + host; };
    var cookie5 = function(host) { return 'cookie5=value5; Expires=Fri, 01-Mar-2019 00:00:01 GMT; Domain=' + host; };

    var destServer = createServerWithLibName('http', function(req, resp) {
      resp.statusCode = 200;
      resp.setHeader('set-cookie', [
        cookie1('.server.com'),
        cookie2('.server.com'),
        cookie3('.server.com'),
        cookie4('.server.com'),
        cookie5('.server-with-number42-and-dash.eu')
      ]);
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8065/');
    proxyOptions.cookieRewrite = ".proxy.com";
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8065, 'localhost', function() {
      app.listen(8064);

      var options = url.parse('http://localhost:8064/foo/test/');

      http.get(options, function (res) {
        var cookies = res.headers['set-cookie'];
        assert.strictEqual(cookies[0], cookie1(proxyOptions.cookieRewrite));
        assert.strictEqual(cookies[1], cookie2(proxyOptions.cookieRewrite));
        assert.strictEqual(cookies[2], cookie3(proxyOptions.cookieRewrite));
        assert.strictEqual(cookies[3], cookie4(proxyOptions.cookieRewrite));
        assert.strictEqual(cookies[4], cookie5(proxyOptions.cookieRewrite));
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    })
  });

  it("removes the Secure directive when proxying from https to http", function(done) {
    var cookie1 = function(host, after) { 
      if (after) {
        return 'cookie1=value1; Expires=Fri, 01-Mar-2019 00:00:01 GMT; Domain=' + host; 
      } else {
        return 'cookie1=value1; Expires=Fri, 01-Mar-2019 00:00:01 GMT; Domain=' + host+';Secure'; 
      }
    };

    var destServer = createServerWithLibName('https', function(req, resp) {
      resp.statusCode = 200;
      resp.setHeader('set-cookie', [
        cookie1('.server.com')
      ]);
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('https://localhost:8066/');
    proxyOptions.cookieRewrite = ".proxy.com";
    proxyOptions.rejectUnauthorized = false;
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8066, 'localhost', function() {
      app.listen(8067);

      var options = url.parse('http://localhost:8067/foo/test/');

      http.get(options, function (res) {
        var cookies = res.headers['set-cookie'];
        assert.strictEqual(cookies[0], cookie1(proxyOptions.cookieRewrite, true));
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    })
  });

  it("does not forward the Host header with default options", function(done) {
    var destServer = createServerWithLibName('http', function(req, resp) {
      assert.strictEqual(req.headers.host, 'localhost:8068');
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8068/');
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8068, 'localhost', function() {
      app.listen(8069);

      var options = url.parse('http://localhost:8069/foo/test/');
      http.get(options, function () {
        // ok...
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("does not forward the Host header with options.preserveHost = false", function(done) {
    var destServer = createServerWithLibName('http', function(req, resp) {
      assert.strictEqual(req.headers.host, 'localhost:8070');
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8070/');
    proxyOptions.preserveHost = false;
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8070, 'localhost', function() {
      app.listen(8071);

      var options = url.parse('http://localhost:8071/foo/test/');
      http.get(options, function () {
        // ok...
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("forwards the Host header with options.preserveHost = true", function(done) {
    var destServer = createServerWithLibName('http', function(req, resp) {
      assert.strictEqual(req.headers.host, 'localhost:8073');
      resp.statusCode = 200;
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8072/');
    proxyOptions.preserveHost = true;
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8072, 'localhost', function() {
      app.listen(8073);

      var options = url.parse('http://localhost:8073/foo/test/');
      http.get(options, function () {
        // ok...
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    });
  });

  it("correctly applies the location header to the response when the response status code is 201", function(done) {
    var destServer = createServerWithLibName('http', function(req, resp) {
      resp.statusCode = 201;
      resp.setHeader('location', 'http://localhost:8085/foo/redirect/');
      resp.write(req.url);
      resp.end();
    });

    var proxyOptions = url.parse('http://localhost:8085/');
    var app = connect();
    app.use(proxy(proxyOptions));

    destServer.listen(8085, 'localhost', function() {
      app.listen(8084);

      var options = url.parse('http://localhost:8084/foo/test/');

      http.get(options, function (res) {
        assert.strictEqual(res.headers.location, '/foo/redirect/');
        done();
      }).on('error', function () {
        assert.fail('Request proxy failed');
      });
    })
  });

});

function createServerWithLibName(libName, requestListener) {
  var httpLib = require(libName);
  if (libName === "http") {
    return httpLib.createServer(requestListener);
  } else {
    return httpLib.createServer({key: key, cert: cert}, requestListener);
  }
}

function testWith (srcLibName, destLibName, cb) {
  var srcHttp = require(srcLibName);
  var destHttp = require(destLibName);

  var destServer = createServerWithLibName(destLibName, function(req, resp) {
    assert.strictEqual(req.method, 'GET');
    assert.strictEqual(req.headers['x-custom-header'], 'hello');
    assert.strictEqual(req.url, '/api/a/b/c/d');
    resp.statusCode = 200;
    resp.setHeader('x-custom-reply', "la la la");
    resp.write('this is your body.');
    resp.end();
  });
  destServer.listen(0, 'localhost', function() {
    var app = connect();
    var destEndpoint = destLibName + "://localhost:" + destServer.address().port + "/api";
    var reqOpts = url.parse(destEndpoint);
    reqOpts.rejectUnauthorized = false; // because we're self-signing for tests
    app.use(proxy(reqOpts));
    var srcServer = createServerWithLibName(srcLibName, app);
    srcServer.listen(0, 'localhost', function() {
      // make client request to proxy server
      var srcRequest = srcHttp.request({
        port: srcServer.address().port,
        method: "GET",
        path: "/a/b/c/d",
        headers: {
          "x-custom-header": "hello"
        },
        rejectUnauthorized: false
      }, function (resp) {
        var buffer = "";
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(resp.headers['x-custom-reply'], 'la la la');
        resp.setEncoding('utf8');
        resp.on('data', function(data) {
          buffer += data;
        });
        resp.on('end', function() {
          assert.strictEqual(buffer, 'this is your body.');
          srcServer.close();
          destServer.close();
          cb();
        });
      });
      srcRequest.end();
    });
  });
}
