"use strict";

var gulp = require('gulp');
var minifycss = require('gulp-minify-css');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var concat = require('gulp-concat');
var del = require('del');
var merge = require('merge-stream');
var _ = require('lodash');
var runSequence = require('run-sequence');
var fs = require('fs');

var config = require('./config');

gulp.task('build-styles', function() {
    var stream = merge();
    var bundles = config.get("web:bundles:css");

    Object.keys(bundles).forEach(name => {
        stream.add(gulp.src(bundles[name].map(path => 'web/public/' + _.trimLeft(path, '/')))
            .pipe(minifycss())
            .pipe(concat(name + '.css'))
            .pipe(gulp.dest('web/public_dist_temp/css'))
        );
    });

    return stream;
});

gulp.task('build-scripts', function() {
    var stream = merge();
    var bundles = config.get("web:bundles:js");

    Object.keys(bundles).forEach(name => {
        stream.add(gulp.src(bundles[name].map(path => 'web/public/' + _.trimLeft(path, '/')))
                .pipe(concat(name + '.js'))
                .pipe(uglify())
                .pipe(gulp.dest('web/public_dist_temp/js'))
        );
    });

    return stream;
});

gulp.task('copy-other-files', function() {
    return gulp.src(['web/public/**/*.{gif,png,jpg,jpeg}', 'web/public/*.{html,txt}'])
        .pipe(gulp.dest('web/public_dist_temp'));
});

gulp.task('clean-temp-dist', function() {
    return del(['web/public_dist_temp']);
});

gulp.task('move-temp-to-dist', function(callback) {
    del('web/public_dist')
        .then(function () {
            fs.rename('web/public_dist_temp', 'web/public_dist', function (err) {
                if (err) {
                    return callback(err);
                }

                return callback();
            });
        })
        .catch(function (err) {
           callback(err);
        });
});

gulp.task('build', function(callback) {
    runSequence('clean-temp-dist',
        ['build-scripts', 'build-styles', 'copy-other-files'],
        'move-temp-to-dist',
        callback);
});