var gulp = require('gulp-help')(require('gulp')),
    gulpUtil = require('gulp-util'),
    tutum = require('gulp-util'),
    Prom = require('bluebird'),
    sh = Prom.promisify(require('shelljs').exec),
    path = require('path'),
    grev = Prom.promisify(function(cb) {
        return require('git-rev').short(function(string) {
            cb(null, string);
        });
    }),

    IMAGE = __dirname.split(path.sep).pop() + '_web'
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
            return sh(['docker tag ', IMAGE, ':latest ', IMAGE, ':', rev].join(''))
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


gulp.task('deploy', function() {
    return grev().then(function(rev) {
        return sh([
                ['tutum login -u', TUSER, '-p', TPASS].join(' '),
                ['tutum terminate ', IMAGE].join(''),
                ['tutum stop ', IMAGE].join(''),
                ['tutum service run -p 80:80 -n ', IMAGE, ' tutum.co/', TUSER,'/', IMAGE, ':', rev].join('')
            ].join(' && '));
    })
});
