#!/bin/sh

cd ~/apps/site-mapper
git pull
gulp build
pm2 restart all
cd -
