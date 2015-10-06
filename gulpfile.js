var gulp = require('gulp-help')(require('gulp')),
    gulpUtil = require('gulp-util'),
    Tutum = require('tutum'),
    Prom = require('bluebird'),
    sh = Prom.promisify(require('shelljs').exec),
    path = require('path'),
    grev = Prom.promisify(function(cb) {
        return require('git-rev').short(function(string) {
            cb(null, string);
        });
    }),

    APP = __dirname.split(path.sep).pop(),
    IMAGE = APP + '_web',
    TUSER = process.env.TUSER,
    TPASS = process.env.TPASS
    ;

gulp.task('default', ['help']);

gulp.task('build', function() {
    return sh('docker-compose kill && docker-compose rm -f')
        .then(function() {
            return Prom.join(grev(), sh('docker-compose build'));
        })
        .spread(function(rev) {
            return sh(['docker tag -f ', IMAGE, ':latest ', IMAGE, ':', rev].join(''))
        })
        ;
});

gulp.task('push', function() {
    return grev().then(function(rev) {
        return sh([
                ['tutum login -u', TUSER, '-p', TPASS].join(' '),
                ['tutum push ', IMAGE, ':', 'latest'].join(''),
                ['tutum push ', IMAGE, ':', rev].join('')
            ].join(' && '));
    })
});

//@todo: should use the tutum api
gulp.task('deploy', function() {
    return grev().then(function(rev) {
        // login
        var tutum = Prom.promisifyAll(new Tutum({
                username: process.env.TUSER,
                apiKey: process.env.TAPIKEY
            }));

            function validateService(service, target) {
                if(service && ['not running', 'running'].indexOf(service.state.toLowerCase()) === -1) {
                    throw new Error(['Invalid service state:', target, service.state].join(' '));
                }
            }

            function terminateService(service) {
                console.log('Terminating:', service.name);
                return tutum.deleteAsync('service/' + service.uuid);
            }

            return Prom.join(tutum.getAsync('service', {name: APP + '-blue'}), tutum.getAsync('service', {name: APP + '-green'}))
                .spread(function(blue, green) {
                    return [
                        blue.objects.filter(function(service) {
                            return service.state !== 'Terminated';
                        }).pop(),
                        green.objects.filter(function(service) {
                            return service.state !== 'Terminated';
                        }).pop()
                    ]
                })
                .spread(function(blue, green) {
                    validateService(blue, APP + '-blue');
                    validateService(green, APP + '-green');
                    return [blue, green];
                })
                .spread(function(blue, green) {
                    // get target service name (e.g. green or blue)
                    return [
                        APP + '-' + (blue? 'green' : 'blue'),
                        blue? green : blue,
                        blue? blue : green
                    ];
                })
                .spread(function(target, previous, current) {
                    if(previous && previous.state !== 'Terminated') {
                        previous = terminateService(previous);
                    }
                    return [target, current, previous];
                })
                .delay(1000)
                .spread(function(target, current) {
                    // launch target service
                    console.log('Deploying target:', target);
                    return Prom.join(tutum.postAsync('service', {
                            image: ['tutum.co/', TUSER,'/', IMAGE, ':', rev].join(''),
                            name: target,
                            container_ports: [{"protocol": "tcp", "inner_port": 80, "outer_port": 80, "published": true}],
                            autorestart: 'ALWAYS',
                            // tags: ['renegare']
                        }), current);
                })
                .delay(1000)
                .spread(function(target, current) {
                    return [tutum.postAsync('service/' + target.uuid + '/start'), current];
                })
                .delay(1000)
                .spread(function(target, current) {
                    // @todo: wait until lb has updated

                    // terminate old services
                    return terminateService(current);
                })
                .catch(function(err) {
                    console.log('Error: ', err.text || err);
                    throw err;
                })
    });
});
