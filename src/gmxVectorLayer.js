﻿// Плагин векторного слоя
L.TileLayer.gmxVectorLayer = L.TileLayer.Canvas.extend(
{
    initialize: function(options) {
        options = L.setOptions(this, options);
        
        this.initPromise = new gmxDeferred();
        
        this._drawQueue = [];
        this._drawQueueHash = {};
        
        this._gmx = {
            'hostName': options.hostName || 'maps.kosmosnimki.ru'
            ,'mapName': options.mapName
            ,'layerName': options.layerName
            ,'beginDate': options.beginDate
            ,'endDate': options.endDate
            ,'sortItems': options.sortItems || function(a, b) { return Number(a.id) - Number(b.id); }
            ,'styles': options.styles || []
            ,tileSubscriptions: []
        };

        this.on('tileunload', function(e) {
            var tile = e.tile,
                tp = tile._tilePoint;

			var key = tile._zoom + '_' + tp.x + '_' + tp.y;
            
            if (key in this._gmx.tileSubscriptions) {
                this._gmx.vectorTilesManager.off(this._gmx.tileSubscriptions[key].id);
                delete this._gmx.tileSubscriptions[key];
            }
            
            for (var k = this._drawQueue.length-1; k >= 0; k--) {
                var elem = this._drawQueue[k];
                if (elem.key === key) {
                    this._drawQueue.splice(k, k+1);
                }
            }
            delete this._drawQueueHash[key];
        })
    },

    _zoomStart: function() {
        this._gmx['zoomstart'] = true;
    },
    
    _zoomEnd: function() {
        this._gmx['zoomstart'] = false;
        this._prpZoomData(map._zoom);
    },
        
    onAdd: function(map) {
        L.TileLayer.Canvas.prototype.onAdd.call(this, map);
                
        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);
    },
    
    onRemove: function(map) {
        L.TileLayer.Canvas.prototype.onRemove.call(this, map);
        map.off('zoomstart', this._zoomStart, this);
        map.off('zoomend', this._zoomEnd, this);
    },
    
    //public interface
    initFromDescription: function(ph) {
        var apikeyRequestHost = this.options.apikeyRequestHost || this._gmx.hostName;
        var sk = gmxSessionManager.getSessionKey(apikeyRequestHost); //should be already received
        this._gmx.sessionKey = sk;
        this._gmx.tileSenderPrefix = "http://" + this._gmx.hostName + "/" + 
            "TileSender.ashx?WrapStyle=None" + 
            "&key=" + encodeURIComponent(sk);
    
        this._gmx.properties = ph.properties;
        this._gmx.geometry = ph.geometry;
        this._gmx.attr = this.initLayerData(ph);
        this._gmx.vectorTilesManager = new gmxVectorTilesManager(this._gmx, ph);
        this._gmx.styleManager = new gmxStyleManager(this._gmx);
        this._gmx.ProjectiveImage = new ProjectiveImage();
        this._update();
                
        this.initPromise.resolve();
    },
    
	setFilter: function (func) {
        this._gmx.vectorTilesManager.setFilter('userFilter', func);
		this._update();
	}
	,
	setDateInterval: function (beginDate, endDate) {
        var gmx = this._gmx;
		gmx.beginDate = beginDate;
		gmx.endDate = endDate;
        gmx.vectorTilesManager.setDateInterval(beginDate, endDate);
		this._update();
	},
    
    addTo: function (map) {
		map.addLayer(this);
		return this;
	},
    
    _drawTileAsync: function (tilePoint, zoom) {
        var queue = this._drawQueue,
            isEmpty = queue.length === 0,
            gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
            key = zoom + '_' + tilePoint.x + '_' + tilePoint.y,
            _this = this
            
        if ( key in this._drawQueueHash ) {
            return;
        }
            
        var drawNextTile = function() {
            if (!queue.length) {
                return;
            }
            
            var bbox = queue.shift();
            delete _this._drawQueueHash[bbox.key];
            _this.gmxDrawTile(bbox.tp, bbox.z);
            
            setTimeout(drawNextTile, 0);
        }
            
        queue.push({gtp: gtp, tp: tilePoint, z: zoom, key: key});
        this._drawQueueHash[key] = true;
        isEmpty && setTimeout(drawNextTile, 0);
    },
    
    _prpZoomData: function(zoom) {
        var gmx = this._gmx,
            map = this._map;
        gmx.tileSize = gmxAPIutils.tileSizes[zoom];
        gmx.mInPixel = 256 / gmx.tileSize;
        gmx._tilesToLoad = 0;
        gmx.currentZoom = map._zoom;
        // Получение сдвига OSM
        var pos = map.getCenter();
        var lat = L.Projection.Mercator.unproject({x: 0, y: gmxAPIutils.y_ex(pos.lat)}).lat;
        var p1 = map.project(new L.LatLng(lat, pos.lng), gmx.currentZoom);
        var point = map.project(pos);
        gmx.shiftY = point.y - p1.y;
        //console.log(gmx.shiftY);
    },
    
	_initContainer: function () {
		L.TileLayer.Canvas.prototype._initContainer.call(this);
        
        var subscriptions = this._gmx.tileSubscriptions,
            zoom = this._map._zoom;
		this._prpZoomData(zoom);
        
        for (var key in subscriptions) {
            if (subscriptions[key].gtp.z !== zoom) {
                this._gmx.vectorTilesManager.off(subscriptions[key].id);
                delete subscriptions[key];
            }
        }
	}
	,
	_update: function () {
		if (!this._map || this._gmx.zoomstart) return;

		var bounds = this._map.getPixelBounds(),
		    zoom = this._map.getZoom(),
		    tileSize = this.options.tileSize;

		if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
			clearTimeout(this._clearBgBufferTimer);
			this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
			return;
		}

		var shiftY = this._gmx.shiftY || 0;		// Сдвиг к OSM
		bounds.min.y += shiftY;
		bounds.max.y += shiftY;

		var nwTilePoint = new L.Point(
		        Math.floor(bounds.min.x / tileSize),
		        Math.floor(bounds.min.y / tileSize)),

		    seTilePoint = new L.Point(
		        Math.floor(bounds.max.x / tileSize),
		        Math.floor(bounds.max.y / tileSize)),

		    tileBounds = new L.Bounds(nwTilePoint, seTilePoint);

        //console.log(this._tiles);
		this._addTilesFromCenterOut(tileBounds);

		if (this.options.unloadInvisibleTiles || this.options.reuseTiles) {
			this._removeOtherTiles(tileBounds);
		}
	}
	,
	_addTile: function (tilePoint) {
        //console.log('addTile', tilePoint);
		var myLayer = this,
            zoom = this._map._zoom,
            gmx = this._gmx;

		if (!gmx.attr) return;

		var gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
        //var key = gmxTilePoint.z + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y;
        var key = zoom + '_' + tilePoint.x + '_' + tilePoint.y;
        //console.log('subscriptions', gmx.tileSubscriptions);
        if (!gmx.tileSubscriptions[key]) {
            gmx._tilesToLoad++;
            //console.log('subscription', zoom, tilePoint);
            var subscrID = gmx.vectorTilesManager.on(gmxTilePoint, function() {
                myLayer._drawTileAsync(tilePoint, zoom);
            });
            gmx.tileSubscriptions[key] = {id: subscrID, gtp: gmxTilePoint};
        }// else {
            //this._tileLoaded();
        // }
	},
	gmxDrawTile: function (tilePoint, zoom) {
		var gmx = this._gmx,
            _this = this;
		if(gmx['zoomstart']) return;

        var screenTile = new gmxScreenVectorTile(this, tilePoint, zoom);
        this._gmx.styleManager.deferred.done(function () {
            screenTile.drawTile();
            var gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
            if (gmx.vectorTilesManager.getNotLoadedTileCount(gtp) === 0) {
                gmx._tilesToLoad--;
                _this._tileLoaded();
            }
        });
	}
	,
	gmxGetCanvasTile: function (tilePoint) {
		var tKey = tilePoint.x + ':' + tilePoint.y;
		
        if (tKey in this._tiles) {
            return this._tiles[tKey];
        }
        
		var tile = this._getTile();
		tile.id = tKey;
        tile._zoom = this._map._zoom;
		tile._layer = this;
		tile._tileComplete = true;
		tile._tilePoint = tilePoint;
		this._tiles[tKey] = tile;
		this._tileContainer.appendChild(tile);

		var tilePos = this._getTilePos(tilePoint);
		var shiftY = this._gmx.shiftY || 0;		// Сдвиг к OSM
		tilePos.y -= shiftY;
		L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome || L.Browser.android23);
		this.tileDrawn(tile);
		return this._tiles[tKey];
	}
	,
	_getLoadedTilesPercentage: function (container) {
		if(!container) return 0;
		var len = 0, count = 0;
		var arr = ['img', 'canvas'];
		for (var key in arr) {
			var tiles = container.getElementsByTagName(arr[key]);
			if(tiles && tiles.length > 0) {
				len += tiles.length;
				for (var i = 0; i < tiles.length; i++) {
					if (tiles[i]._tileComplete) {
						count++;
					}
				}
			}
		}
		if(len < 1) return 0;
		return count / len;	
	}
	,
	_tileLoaded: function () {
        //console.log('_tileLoaded', this._gmx._tilesToLoad);
        if (this._gmx._tilesToLoad === 0) {
			this.fire('load');

			if (this._animated) {
				// clear scaled tiles after all new tiles are loaded (for performance)
				clearTimeout(this._clearBgBufferTimer);
				this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
			}
		}
	}
	,
	_tileOnLoad: function (tile) {
		if (tile) L.DomUtil.addClass(tile, 'leaflet-tile-loaded');
		this._tileLoaded();
	}
	,
	tileDrawn: function (tile) {
		this._tileOnLoad(tile);
	},
    initLayerData: function(layerDescription) {					// построение списка тайлов
        var gmx = this._gmx,
            res = {'items':{}, 'tileCount':0, 'itemCount':0},
            prop = layerDescription.properties,
            type = prop['type'] + (prop['Temporal'] ? 'Temporal' : '');

		var cnt;
		if(type === 'VectorTemporal') {
            cnt = prop['TemporalTiles'];
			
			res['TemporalColumnName'] = prop['TemporalColumnName'];
			res['TemporalPeriods'] = prop['TemporalPeriods'];
			
			var ZeroDateString = prop.ZeroDate || '01.01.2008';	// нулевая дата
			var arr = ZeroDateString.split('.');
			var zn = new Date(					// Начальная дата
				(arr.length > 2 ? arr[2] : 2008),
				(arr.length > 1 ? arr[1] - 1 : 0),
				(arr.length > 0 ? arr[0] : 1)
				);
			res['ZeroDate'] = new Date(zn.getTime()  - zn.getTimezoneOffset()*60000);	// UTC начальная дата шкалы
			res['ZeroUT'] = res['ZeroDate'].getTime() / 1000;
		}
        
        
		res['tileCount'] = cnt;
		res['layerType'] = type;						// VectorTemporal Vector
		res['identityField'] = prop['identityField'];	// ogc_fid
		res['GeometryType'] = prop['GeometryType'];		// тип геометрий обьектов в слое
		res['minZoomRasters'] = prop['RCMinZoomForRasters'] || 8;// мин. zoom для растров
		
		var imageTransform = function(hash) {
            var item = hash.item;
			var gmxTilePoint = hash.gmxTilePoint;
			var img = hash.image;
//Алгоритм натяжения:
//- вычислить 4 угла (текущий алгоритм)
//- посчитать длины сторон
//- если соотношение самой длинной и самой короткой больше, чем 2, тогда северный отрезок из двух коротких - это верхний край квиклука
//- если соотношение меньше, чем 2, то самая северная вершина - это левый верхний угол изображения
            var coord = item.coordinates;
			var points = gmxAPIutils.getQuicklookPoints(coord);
			var mInPixel = gmx.mInPixel;
			var begx = mInPixel * item.bounds.min.x;
			var begy = mInPixel * item.bounds.max.y;
			var dx = begx - 256 * gmxTilePoint.x;
			var dy = 256 - begy + 256 * gmxTilePoint.y;

			var x1 = mInPixel * points['x1'], y1 = mInPixel * points['y1'];
			var x2 = mInPixel * points['x2'], y2 = mInPixel * points['y2'];
			var x3 = mInPixel * points['x3'], y3 = mInPixel * points['y3'];
			var x4 = mInPixel * points['x4'], y4 = mInPixel * points['y4'];

			var	boundsP = gmxAPIutils.bounds([[x1, y1], [x2, y2], [x3, y3], [x4, y4]]);
			x1 -= boundsP.min.x; y1 = boundsP.max.y - y1;
			x2 -= boundsP.min.x; y2 = boundsP.max.y - y2;
			x3 -= boundsP.min.x; y3 = boundsP.max.y - y3;
			x4 -= boundsP.min.x; y4 = boundsP.max.y - y4;
			var ww = Math.round(boundsP.max.x - boundsP.min.x);
			var hh = Math.round(boundsP.max.y - boundsP.min.y);
			var chPoints = function(arr) {
				var out = [];
				var dist = [];
				var px = arr[3][0];
				var py = arr[3][1];
				var maxYnum = 0;
				var maxY = -Number.MAX_VALUE;
				for(var i=0, len=arr.length; i<len; i++) {
					var px1 = arr[i][0], py1 = arr[i][1];
					if(px1 > maxY) maxYnum = i;
					var sx = px1 - px, sy = py1 - py;
					dist.push({'d2': Math.sqrt(sx * sx + sy * sy), 'i': i});
					px = px1, py = py1;
				}
				dist = dist.sort(function(a, b) {
					return a['d2'] - b['d2'];
				});
				var min = Math.min(dist[0], dist[1], dist[2], dist[3]);
				var mn = dist[3]['d2'] / dist[0]['d2'];
				out = arr;
//console.log('alg : ', hash.item.properties.sceneid, mn, maxYnum, (arr[dist[0]['i']][1] > arr[dist[1]['i']][1] ? true : false), arr);
				if(mn > 2) {
					var inum = dist[1]['i'];
					if(arr[dist[0]['i']][1] > arr[dist[1]['i']][1]) {
						out = [arr[0], arr[1], arr[2], arr[3]];
					} else {
						out = [];
						out.push(arr[maxYnum++]);
						if(maxYnum > 3) maxYnum = 0;
						out.push(arr[maxYnum++]);
						if(maxYnum > 3) maxYnum = 0;
						out.push(arr[maxYnum++]);
						if(maxYnum > 3) maxYnum = 0;
						out.push(arr[maxYnum]);
					}
				}
				return out;
			}
			var shiftPoints = chPoints([[x1, y1], [x2, y2], [x3, y3], [x4, y4]]);
			
			var pt = gmx.ProjectiveImage.getCanvas({
				'imageObj': img
				,'points': shiftPoints
				,'wView': ww
				,'hView': hh
				,'deltaX': dx
				,'deltaY': dy
				//,'patchSize': 64
				//,'limit': 4
			});
			return pt['canvas'];
		};
		
		if(prop['IsRasterCatalog']) {
			res['IsRasterCatalog'] = prop['IsRasterCatalog'];
			res['rasterBGfunc'] = function(x, y, z, idr) {
				return 'http://' + gmx.hostName
					+'/TileSender.ashx?ModeKey=tile'
					+'&x=' + x
					+'&y=' + y
					+'&z=' + z
					+'&idr=' + idr
					+'&MapName=' + gmx.mapName
					+'&LayerName=' + gmx.layerName
					+'&key=' + encodeURIComponent(gmx.sessionKey);
			};
			res['imageQuicklookProcessingHook'] = imageTransform;
		} else if(prop['Quicklook']) {
			var template = res['Quicklook'] = prop['Quicklook'];
			res['rasterBGfunc'] = function(item) {
				var properties = item.properties;
				var url = template;
				var reg = /\[([^\]]+)\]/;
				var matches = reg.exec(url);
				while(matches && matches.length > 1) {
					url = url.replace(matches[0], properties[matches[1]]);
					matches = reg.exec(url);
				}
				return url;
			};
			res['imageProcessingHook'] = imageTransform;
		}
		return res;
	}
});