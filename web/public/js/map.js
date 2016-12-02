function zoomToNodes(force) {
    var svg = d3.select('#siteMap');
    var nodes = svg.selectAll('circle');

    var minX = null;
    var maxX = null;
    var minY = null;
    var maxY = null;

    nodes.each(function (node) {
        if ((minX == null) || (minX > node.x))
            minX = node.x;
        if ((maxX == null) || (maxX < node.x))
            maxX = node.x;
        if ((minY == null) || (minY > node.y))
            minY = node.y;
        if ((maxY == null) || (maxY < node.y))
            maxY = node.y;
    });

    var width = $('#siteMap').width(),
        height = $('#siteMap').height();

    if ((minX == maxX) && (minY == maxY)) {
        nodes.each(function (node) {
            node.px = node.x = width / 2;
            node.py = node.y = height / 2;
            node.fixed = true;
        });
        return;
    }

    if ((minX == null) || (maxX == null) || (minX == maxX))
        return;
    if ((minY == null) || (maxY == null) || (minY == maxY))
        return;

    var rotate = maxX - minX < maxY - minY;
    var padding = 40;

    if (!rotate) {
        var zoom = Math.min((width - padding) / (maxX - minX), (height - padding) / (maxY - minY));

        var left = (width - (maxX - minX) * zoom) / 2;
        var top = (height - (maxY - minY) * zoom) / 2;

        nodes.each(function (node) {
            node.px = node.x = left + (node.x - minX) * zoom;
            node.py = node.y = top + (node.y - minY) * zoom;
            node.fixed = true;
        });
    }
    else {
        var zoom = Math.min((width - padding) / (maxY - minY), (height - padding) / (maxX - minX));

        var left = (width - (maxY - minY) * zoom) / 2;
        var top = (height - (maxX - minX) * zoom) / 2;

        nodes.each(function (node) {
            var x = node.x;
            node.px = node.x = left + (node.y - minY) * zoom;
            node.py = node.y = top + (x - minX) * zoom;
            node.fixed = true;
        });
    }

    force.tick();
}

function updateMapSize() {
    var deltaX = $('#siteMapBox').width() - $('#siteMap').width();
    var deltaY = $('#siteMapBox').height() - $('#siteMap').height();
    var width = Math.max(800, $(window).width() * 0.8);
    var height = Math.max(400, $(window).height() - 280);
    $('#siteMapBox')
        .width(width + deltaX)
        .height(height + deltaY);
    $('#siteMapLoading, #siteMap')
        .width(width)
        .height(height);

    d3.select('#siteMap')
        .attr('viewBox', '0 0 ' + width + ' ' + height)
}

function initSiteMap(jsonUrl) {
    var lastTimeStamp = null;
    var numberOfRefreshes = 0;
    var maxNumberOfRefreshes = 30;

    $('.btn').button();
    var mode = Cookies.get('highlightLinkMode');
    if (mode == 1)
        $('#highlightOutgoingLabel').button('toggle');
    else if (mode == 2)
        $('#highlightIncomingLabel').button('toggle');
    else
        $('#highlightAllLabel').button('toggle');

    $('#linkHighlightOptions label').on('click', function () {
        var label = $(this);
        var option;
        switch (label.attr('id'))
        {
            case 'highlightOutgoingLabel':
                option = 1;
                break;
            case 'highlightIncomingLabel':
                option = 2;
                break;
            default:
                option = 0;
        }

        Cookies.set('highlightLinkMode', option, { path: '/' });
    });

    initSiteMapInternal();

    function initSiteMapInternal()
    {
        // Hide all tipsy tooltips
        $('.tipsy').remove();

        // Set map size
        updateMapSize();
        var width = $('#siteMap').width();
        var height = $('#siteMap').height();
        var logicalWidth = 1200;
        var logicalHeight = 600;

        var url = jsonUrl;
        if (lastTimeStamp)
        {
            url += '?contentsTimeStamp=' + lastTimeStamp;
        }

        function showStatus(text) {
            $('#statusText').text(text || 'Status');
            $('#statusText').css('visibility', text ? 'visible' : 'hidden')

            if (text && (text.indexOf('%') != -1))
            {
                $('#progress').show();
            }
            else
            {
                $('#progress').hide();
            }
        }

        d3.json(url, function (error, json) {

            // Use seeded random instead of random to produce the same graph every time
            Math.seedrandom('myrandom');

            // Problem with server
            if (!json)
            {
                if (numberOfRefreshes == 0)
                {
                    $('#siteMapLoading').text('Cannot load map');
                    $('#siteMap').hide();
                    $('#siteMapLoading').show();
                }
                else
                {
                    showStatus('Please refresh the page to update the status');
                }

                return;
            }

            lastTimeStamp = json.contentsTimeStamp;

            // Updating status
            numberOfRefreshes++;
            if (numberOfRefreshes > maxNumberOfRefreshes)
            {
                showStatus('Please refresh the page to update the status');
            }
            else
            {
                showStatus(json.status);
            }

            // Status hasn't changed
            if (!json.nodes || !json.links || (json.nodes.length == 0))
            {
                if (json.domain) // Json is correct - wait for updates
                {
                    if (json.processing) {
                        setTimeout(function () {
                            initSiteMapInternal();
                        }, (numberOfRefreshes > 2 ? 10000 : 5000));
                    }
                    else {
                        $('#siteMapLoading').text(json.status || 'Cannot get map for this site');
                        $('#siteMap').hide();
                        $('#siteMapLoading').show();
                        showStatus();
                    }
                }
                else // Some problem - json is incorrect
                {
                    showStatus('Please refresh the page to update the status');
                }

                return;
            }

            // Clear svg contents
            d3.select('#siteMap').text('');

            var svg = d3.select('#siteMap')
                .attr('viewBox', '0 0 ' + width + ' ' + height)
                .attr('preserveAspectRatio', 'xMidYMid meet')
                .attr('pointer-events', 'all')
                .call(d3.behavior.zoom().on('zoom', zoomMap));

            var vis = svg
                .append('svg:g');

            function zoomMap() {
                vis.attr('transform',
                    'translate(' + d3.event.translate + ')'
                    + ' scale(' + d3.event.scale + ')');
                svg.selectAll('circle')
                    .attr('r', function (d) { return ((d.index == 0) ? 15 : 10) / d3.event.scale; })
                    .each(setNodeStyleWithScale);

                var width = 1 / d3.event.scale;
                svg.selectAll('.link')
                    .style('stroke-width', width + 'px');
            }

            var colorByGroup = d3.scale.category20();

            function setNodeStyleWithScale(d) {
                var node = d3.select(this);
                node.style('fill', colorByGroup(d.group));
                if (d.error) {
                    node.style({
                        'stroke': 'red',
                        'stroke-width': 1.5 / d3.event.scale + 'px',
                        'stroke-dasharray': (5 / d3.event.scale) +  ', ' + (5 / d3.event.scale)
                    });
                }
                else {
                    node.style({
                        'stroke-width': 0.5 / d3.event.scale + 'px',
                    });
                }
            }

            function setNodeStyle(d) {
                var node = d3.select(this);
                node.style('fill', colorByGroup(d.group));
                if (d.error) {
                    node.style({
                        'stroke': 'red',
                        'stroke-width': '1.5px',
                        'stroke-dasharray': '5, 5'
                    });
                }
            }

            var force = d3.layout.force()
                .gravity(.05)
                .distance(100)
                .charge(-100)
                .size([logicalWidth, logicalHeight]);

            // Updating map
            var nodeCount = json.nodes.length;
            if (nodeCount != 0)
            {
                json.nodes.forEach(function (d, i) {
                    d.x = logicalWidth / nodeCount * i;
                    d.y = logicalHeight / 2 + Math.random() - 0.5;
                });
            }

            force
                .nodes(json.nodes)
                .links(json.links)
                .start();

            var link = vis.selectAll('.link')
                .data(json.links)
                .enter().append('line')
                .attr('class', 'link');

            var nodes = vis.selectAll('.node')
                .data(json.nodes)
                .enter()
                .append('circle')
                .attr('class', 'node')
                .attr('r', function (d) { return (d.index == 0) ? 15 : 10; })
                .each(setNodeStyle)
                .on('mouseover', highlightLinks(true))
                .on('mouseout', highlightLinks(false))
                .on('click', function (d) {
                    window.open(d.url, '_blank');
                });

            $('svg circle').tipsy({
                gravity: 'w',
                html: true,
                title: function () {
                    var d = this.__data__;
                    return (d.title ? $('<div>').text(d.title).html() + '<br />' : '') +
                        $('<div>').text(decodeURI(d.url)).html() +
                        (d.error ? '<br />Error: ' + d.error : '');
                }
            });

            // Rewind to end
            if (true) {
                var k = 0;
                while ((force.alpha() > 1e-2) && (k < 300)) {
                    force.tick(),
                        k = k + 1;
                }

                force.stop();
            }

            function updateNodes() {
                link.attr('x1', function (d) { return d.source.x; })
                    .attr('y1', function (d) { return d.source.y; })
                    .attr('x2', function (d) { return d.target.x; })
                    .attr('y2', function (d) { return d.target.y; });

                nodes.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
            }

            function highlightLinks(highlight) {
                return function (d) {
                    if (highlight) {
                        var label = $('#linkHighlightOptions label.active');
                        var highlightIncoming = (label.attr('id') == 'highlightAllLabel') || (label.attr('id') == 'highlightIncomingLabel');
                        var highlightOutgoing = (label.attr('id') == 'highlightAllLabel') || (label.attr('id') == 'highlightOutgoingLabel');

                        link.style({
                            'stroke': function (o) {
                                return ((o.source === d) && highlightOutgoing) || ((o.target === d) && highlightIncoming) ? '#888888' : '#CCCCCC';
                            },
                            'stroke-opacity': function (o) {
                                return ((o.source === d) && highlightOutgoing) || ((o.target === d) && highlightIncoming) ? 1 : 0.1;
                            }
                        });
                    }
                    else {
                        link.style({ 'stroke': null, 'stroke-opacity': null });
                    }
                };
            }

            zoomToNodes(force);
            updateNodes();

            $('#siteMapLoading').hide();
            $('#siteMap').show();

            if (json.processing && (numberOfRefreshes <= maxNumberOfRefreshes))
            {
                setTimeout(function () {
                    initSiteMapInternal();
                }, (numberOfRefreshes > 2 ? 10000 : 5000));
            }

            $(window).resize(function () {
                updateMapSize();
                zoomToNodes(force);
                updateNodes();
            });
        });
    }
}