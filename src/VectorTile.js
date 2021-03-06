//Single vector tile, received from GeoMixer server
//"dataProvider" has single method "load": function(x, y, z, v, s, d, callback), which calls "callback" with data of loaded tile
var gmxVectorTile = function(dataProvider, x, y, z, v, s, d) {
    var loadDef = null,
        _this = this;

    this.addData = function(data, keys) {

        this.removeData(keys, true);

        var len = data.length;
        var dataOptions = new Array(len);
        for (var i = 0; i < len; i++) {
            var it = data[i];
            dataOptions[i] = gmxAPIutils.geoItemBounds(it[it.length - 1]);
        }

        this.data = this.data.concat(data);
        this.dataOptions = this.dataOptions.concat(dataOptions);

        this.state = 'loaded';
        if (loadDef) {
            loadDef.resolve(this.data);
        }
    };

    this.removeData = function(keys) {
        for (var arr = this.data || [], i = arr.length - 1; i >= 0; i--) {
            if (keys[arr[i][0]]) {
                arr.splice(i, 1);
                this.dataOptions.splice(i, 1);
            }
        }
    };

    this.load = function() {
        if (!loadDef) {
            loadDef = new gmxDeferred();
            this.state = 'loading';
            dataProvider.load(x, y, z, v, s, d, function(data) {
                _this.addData(data);
            });
        }

        return loadDef;
    };

    this.clear = function() {
        this.state = 'notLoaded';
        this.data = [];
        this.dataOptions = [];

        loadDef = null;
    };

    this.calcEdgeLines = function(num) {
        if (!this.data[num]) { return null; }
        if (!this.dataOptions[num]) { this.dataOptions[num] = {}; }
        var hiddenLines = this.dataOptions[num].hiddenLines || null;
        if (!hiddenLines) {
            var it = this.data[num],
                geomIndex = it.length - 1, //geometry is always the last attribute
                geom = it[geomIndex];

            if (geom.type.indexOf('POLYGON') !== -1) {
                var coords = geom.coordinates;
                if (geom.type === 'POLYGON') {
                    coords = [coords];
                }
                var edgeBounds = gmxAPIutils.bounds().extendBounds(this.bounds).addBuffer(-0.05);
                    //.addBuffer((this.bounds.min.x - this.bounds.max.x) / 10000);
                for (var j = 0, len = coords.length; j < len; j++) {
                    var coords1 = coords[j],
                        hiddenLines1 = [];
                    for (var j1 = 0, len1 = coords1.length; j1 < len1; j1++) {
                        hiddenLines1.push(gmxAPIutils.getHidden(coords1[j1], edgeBounds));
                    }
                    if (hiddenLines1.length) {
                        if (!hiddenLines) { hiddenLines = []; }
                        hiddenLines.push(hiddenLines1);
                    }
                }
                if (hiddenLines) {
                    if (!this.dataOptions[num]) { this.dataOptions[num] = {}; }
                    this.dataOptions[num].hiddenLines = hiddenLines;
                }
            }
        }
        return hiddenLines;
    };

    this.bounds = gmxAPIutils.getTileBounds(x, y, z);
    this.data = [];
    this.dataOptions = [];
    this.x = x;
    this.y = y;
    this.z = z;
    this.s = s;
    this.d = d;
    this.gmxTilePoint = {x: x, y: y, z: z, s: s, d: d};
    this.vectorTileKey = z + '_' + x + '_' + y + '_' + v + '_' + s + '_' + d;
    this.state = 'notLoaded'; //notLoaded, loading, loaded
};

gmxVectorTile.makeTileKey = function(x, y, z, v, s, d) {
    return z + '_' + x + '_' + y + '_' + v + '_' + s + '_' + d;
};

gmxVectorTile.parseTileKey = function(gmxTileKey) {
    var p = gmxTileKey.split('_');
    return {z: p[0], x: p[1], y: p[2], v: p[3], s: p[4], d: p[5]};
};

gmxVectorTile.boundsFromTileKey = function(gmxTileKey) {
    var p = gmxVectorTile.parseTileKey(gmxTileKey);
    return gmxAPIutils.getTileBounds(p.x, p.y, p.z);
};
