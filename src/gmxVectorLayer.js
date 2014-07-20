﻿L.gmx.VectorLayer = L.TileLayer.Canvas.extend(
{
    options: {
        clickable: true
    },

    initialize: function(options) {
        options = L.setOptions(this, options);

        this.initPromise = new gmxDeferred();

        this._drawQueue = [];
        this._drawQueueHash = {};

        this._gmx = {
            hostName: options.hostName || 'maps.kosmosnimki.ru',
            mapName: options.mapName,
            layerID: options.layerID,
            beginDate: options.beginDate,
            endDate: options.endDate,
            sortItems: options.sortItems || null,
            styles: options.styles || [],
            units: options.units || {square: 'km2', distance: 'km', coordinates: 0},
            screenTiles: {},
            tileSubscriptions: []
        };

        this.on('tileunload', function(e) {
            var tile = e.tile,
                tp = tile._tilePoint,
                key = tile._zoom + ':' + tp.x + ':' + tp.y,
                gmx = this._gmx,
                screenTiles = gmx.screenTiles;

            if (key in gmx.tileSubscriptions) {
                gmx.vectorTilesManager.off(gmx.tileSubscriptions[key].id);
                delete gmx.tileSubscriptions[key];
            }

            for (var k = this._drawQueue.length-1; k >= 0; k--) {
                var elem = this._drawQueue[k];
                if (elem.key === key) {
                    this._drawQueue.splice(k, 1);
                }
            }
            delete this._drawQueueHash[key];
            if (screenTiles[key]) {
                screenTiles[key].cancel();
                delete screenTiles[key];
            }
        });
    },

    _zoomStart: function() {
        this._gmx.zoomstart = true;
    },

    _zoomEnd: function() {
        this._gmx.zoomstart = false;
        this._prpZoomData(this._map._zoom);
    },

    onAdd: function(map) {
        if (map.options.crs !== L.CRS.EPSG3857 && map.options.crs !== L.CRS.EPSG3395) {
            throw "GeoMixer-Leaflet: map projection is incompatible with GeoMixer layer";
        }

        this._gmx.applyShift = map.options.crs === L.CRS.EPSG3857;

        L.TileLayer.Canvas.prototype.onAdd.call(this, map);

        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);
        if (this._gmx.applyShift) {
            map.on('moveend', this._updateShiftY, this);
            this._updateShiftY();
        } else {
            this._gmx.shiftY = 0;
        }
        if (this._gmx.balloonEnable && !this._popup) this.bindPopup();
        //if (this._gmx._observer) this._gmx._observer.setActive(true);
    },

    onRemove: function(map) {
        L.TileLayer.Canvas.prototype.onRemove.call(this, map);
        map.off('zoomstart', this._zoomStart, this);
        map.off('zoomend', this._zoomEnd, this);

        if (this._gmx.applyShift) {
            map.off('moveend', this._updateShiftY, this);
        }
    },

    //public interface
    initFromDescription: function(ph) {
        var gmx = this._gmx,
            apikeyRequestHost = this.options.apikeyRequestHost || gmx.hostName,
            sk = gmxSessionManager.getSessionKey(apikeyRequestHost); //should be already received
        gmx.sessionKey = sk;
        gmx.tileSenderPrefix = "http://" + gmx.hostName + "/" + 
            "TileSender.ashx?WrapStyle=None" + 
            "&key=" + encodeURIComponent(sk);

        gmx.properties = ph.properties;
        gmx.geometry = ph.geometry;

        this.initLayerData(ph);
        gmx.vectorTilesManager = new gmxVectorTilesManager(gmx, ph);
        gmx.styleManager = new gmxStyleManager(gmx);
        gmx.ProjectiveImage = new ProjectiveImage();
        this._update();

        this.initPromise.resolve();
    },

    setStyle: function (style, num) {
        var gmx = this._gmx;
        this.initPromise.then(function() {
            gmx.styleManager.setStyle(style, num);
        });
        return this;
    },

    setStyleHook: function (func) {
        this._gmx.styleHook = func;
        return this;
    },

    removeStyleHook: function () {
        this._gmx.styleHook = null;
    },

    setPropertiesHook: function (func) {
        //this._gmx.vectorTilesManager.setPropertiesHook.bind(this._gmx.vectorTilesManager, 'userHook', func);
        this._gmx.vectorTilesManager.setPropertiesHook('userHook', func);
        return this;
    },

    setFilter: function (func) {
        this._gmx.vectorTilesManager.setPropertiesHook('userFilter', function(item) {
            return !func || func(item) ? item.properties : null;
        });
        this._redrawTiles();
        return this;
    },

    removeFilter: function () {
        this._gmx.vectorTilesManager.removePropertiesHook('userFilter');
        this._redrawTiles();
        return this;
    },

    setDateInterval: function (beginDate, endDate) {
        var gmx = this._gmx;
        gmx.beginDate = beginDate;
        gmx.endDate = endDate;
        gmx.vectorTilesManager.setDateInterval(beginDate, endDate);
        this._redrawTiles();
        return this;
    },

    _redrawTiles: function () {
        gmxImageLoader.clearLayer(this._gmx.layerID);

        if (this._map) {
            var zoom = this._map._zoom;
            for (var key in this._tiles) {
                var tile = this._tiles[key],
                    tilePoint = tile._tilePoint,
                    zkey = zoom + ':' + tilePoint.x + ':' + tilePoint.y;
                delete this._gmx.tileSubscriptions[zkey];
                this._addTile(tilePoint);
            }
            this._update();
        }
    },

    addTo: function (map) {
        map.addLayer(this);
        return this;
    },

    _drawTileAsync: function (tilePoint, zoom) {
        var queue = this._drawQueue,
            isEmpty = queue.length === 0,
            key = zoom + '_' + tilePoint.x + '_' + tilePoint.y,
            _this = this;

        if ( key in this._drawQueueHash ) {
            return this._drawQueueHash[key];
        }

        var drawNextTile = function() {
            if (!queue.length) {    // TODO: may be need load rasters in tile
                _this.fire('doneDraw');
                return;
            }
            
            var bbox = queue.shift();
            delete _this._drawQueueHash[bbox.key];
            _this.gmxDrawTile(bbox.tp, bbox.z).then(
                bbox.def.resolve.bind(bbox.def),
                bbox.def.reject.bind(bbox.def)
            );
            setTimeout(drawNextTile, 0);
        }
        
        var gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
        var def = new gmxDeferred();
        queue.push({gtp: gtp, tp: tilePoint, z: zoom, key: key, def: def});
        this._drawQueueHash[key] = def;
        
        if (isEmpty) {
            this.fire('startDraw');
            setTimeout(drawNextTile, 0);
        }
        
        return def;
    },

    _updateShiftY: function() {
        var gmx = this._gmx,
            map = this._map,
            pos = map.getCenter(),
            merc = L.Projection.Mercator.project(pos),
            currProject = map.options.crs.project(pos),
            deltaY = map.options.crs.project(pos).y - L.Projection.Mercator.project(pos).y;

        gmx.shiftX = gmx.mInPixel * (gmx.shiftXlayer || 0);
        gmx.shiftY = gmx.mInPixel * (deltaY + (gmx.shiftYlayer || 0));

        for (var t in this._tiles) {
            var tile = this._tiles[t],
                pos = this._getTilePos(tile._tilePoint);
            pos.x += gmx.shiftX;
            pos.y -= gmx.shiftY;
            L.DomUtil.setPosition(tile, pos, L.Browser.chrome || L.Browser.android23);
        }
        this._update();
    },

    _prpZoomData: function(zoom) {
        var gmx = this._gmx,
            map = this._map;
        gmx.tileSize = gmxAPIutils.tileSizes[zoom];
        gmx.mInPixel = 256 / gmx.tileSize;
        gmx._tilesToLoad = 0;
        gmx.currentZoom = map._zoom;
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
    },

    _update: function () {
        if (!this._map || this._gmx.zoomstart) return;

        var zoom = this._map.getZoom();
        if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
            clearTimeout(this._clearBgBufferTimer);
            this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
            return;
        }
        var tileBounds = this._getScreenTileBounds();
        this._addTilesFromCenterOut(tileBounds);

        if (this.options.unloadInvisibleTiles || this.options.reuseTiles) {
            this._removeOtherTiles(tileBounds);
        }
    },

    _getScreenTileBounds: function () {
        var map = this._map,
            zoom = map._zoom,
            pz = Math.pow(2, zoom),
            bounds = map.getPixelBounds(),
            shiftX = this._gmx.shiftX || 0,     // Сдвиг слоя
            shiftY = this._gmx.shiftY || 0,     // Сдвиг слоя + OSM
            tileSize = this.options.tileSize;

        bounds.min.y += shiftY, bounds.max.y += shiftY;
        bounds.min.x -= shiftX, bounds.max.x -= shiftX;

        var nwTilePoint = new L.Point(
                Math.floor(bounds.min.x / tileSize),
                Math.floor(bounds.min.y / tileSize)),

            seTilePoint = new L.Point(
                Math.floor(bounds.max.x / tileSize),
                Math.floor(bounds.max.y / tileSize));

        if (nwTilePoint.y < 0) nwTilePoint.y = 0;
        if (seTilePoint.y >= pz) seTilePoint.y = pz - 1;
        return new L.Bounds(nwTilePoint, seTilePoint);
    },

    _addTile: function (tilePoint) {
        var myLayer = this,
            zoom = this._map._zoom,
            gmx = this._gmx;

        if (!gmx.layerType || !gmx.styleManager.isVisibleAtZoom(zoom)) {
            this._tileLoaded();
            return;
        }

        var key = zoom + ':' + tilePoint.x + ':' + tilePoint.y;
        if (!gmx.tileSubscriptions[key]) {
            gmx._tilesToLoad++;
            var isDrawnFirstTime = false;
            var gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
            var subscrID = gmx.vectorTilesManager.on(gmxTilePoint, function() {
                myLayer._drawTileAsync(tilePoint, zoom).then(function() {
                    if (!isDrawnFirstTime) {
                        gmx._tilesToLoad--;
                        myLayer._tileLoaded();
                        isDrawnFirstTime = true;
                    }
                }, function() {
                    gmx._tilesToLoad--;
                    myLayer._tileLoaded();
                });
            });
            gmx.tileSubscriptions[key] = {id: subscrID, gtp: gmxTilePoint};
        }
    },

    gmxDrawTile: function (tilePoint, zoom) {
        var gmx = this._gmx,
            def = new gmxDeferred();
            
        if(gmx.zoomstart || !this._map) {
            def.resolve();
            return def;
        };

        var screenTiles = gmx.screenTiles,
            zoom = this._map._zoom,
            zkey = zoom + ':' + tilePoint.x + ':' + tilePoint.y,
            screenTile = null,
            _this = this;

        if (!screenTiles[zkey]) {
            screenTiles[zkey] = screenTile = new gmxScreenVectorTile(this, tilePoint, zoom);
        } else {
            screenTile = screenTiles[zkey];
            screenTile.cancel();
        }
        
        gmx.styleManager.deferred.then(function () {
            screenTile.drawTile().then(def.resolve.bind(def), def.reject.bind(def));
        });
        
        return def;
    },

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
        tilePos.x += this._gmx.shiftX || 0;
        tilePos.y -= this._gmx.shiftY || 0; // Сдвиг слоя
        L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome || L.Browser.android23);

        this.tileDrawn(tile);
        return this._tiles[tKey];
    },

    _getLoadedTilesPercentage: function (container) {
        if(!container) return 0;
        var len = 0, count = 0;
        var arr = ['img', 'canvas'];
        for (var key in arr) {
            var tiles = container.getElementsByTagName(arr[key]);
            if(tiles && tiles.length > 0) {
                len += tiles.length;
                for (var i = 0, len1 = tiles.length; i < len1; i++) {
                    if (tiles[i]._tileComplete) {
                        count++;
                    }
                }
            }
        }
        if(len < 1) return 0;
        return count / len;	
    },

    _tileLoaded: function () {
        if (this._gmx._tilesToLoad === 0) {
            this.fire('load');

            if (this._animated) {
                L.DomUtil.addClass(this._tileContainer, 'leaflet-zoom-animated');
                // clear scaled tiles after all new tiles are loaded (for performance)
                clearTimeout(this._clearBgBufferTimer);
                this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
            }
        }
    },

    _tileOnLoad: function (tile) {
        if (tile) L.DomUtil.addClass(tile, 'leaflet-tile-loaded');
        this._tileLoaded();
    },

    tileDrawn: function (tile) {
        this._tileOnLoad(tile);
    },

    gmxObjectsByPoint: function (geoItems, point) {    // Получить верхний обьект по координатам mouseClick
        var gmx = this._gmx,
            out = [],
            mInPixel = gmx.mInPixel,
            shiftXlayer = gmx.shiftXlayer || 0,
            shiftYlayer = gmx.shiftYlayer || 0,
            mercPoint = [point.x - shiftXlayer, point.y - shiftYlayer],
            pixelPoint = [mercPoint[0] * mInPixel, mercPoint[1] * mInPixel],
            bounds = gmxAPIutils.bounds([mercPoint]);

        for (var i = geoItems.length - 1; i >= 0; i--) {
            var geoItem = geoItems[i].arr,
                idr = geoItem[0],
                dataOption = geoItems[i].dataOption || {},
                item = gmx.vectorTilesManager.getItem(idr),
                parsedStyle = gmx.styleManager.getObjStyle(item),
                lineWidth = parsedStyle.lineWidth || 0,
                dx = (parsedStyle.sx + lineWidth) / mInPixel,
                dy = (parsedStyle.sy + lineWidth) / mInPixel;

            if (!dataOption.bounds.intersectsWithDelta(bounds, dx, dy)) continue;

            var geom = geoItem[geoItem.length - 1],
                fill = parsedStyle.fill,
                marker = parsedStyle.marker,
                type = geom.type,
                chktype = type,
                hiddenLines = dataOption.hiddenLines,
                boundsArr = dataOption.boundsArr,
                coords = geom.coordinates,
                ph = {
                    point: mercPoint,
                    bounds: bounds,
                    coords: coords,
                    boundsArr: boundsArr
                };

            if(type === 'MULTIPOLYGON' || type === 'POLYGON') {
                if(marker) {
                    chktype = 'POINT';
                } else if(!fill) {
                    if (type === 'POLYGON') {
                        chktype = 'MULTILINESTRING';
                        hiddenLines = hiddenLines[0];
                    } else {
                        chktype = 'LIKEMULTILINESTRING';
                    }
                    ph.hidden = hiddenLines;
                }
            }

            if(chktype === 'LINESTRING') {
                if (!gmxAPIutils.isPointInPolyLine(mercPoint, lineWidth / mInPixel, coords)) continue;
            } else if(chktype === 'LIKEMULTILINESTRING') {
                var flag = false;
                ph.delta = lineWidth / mInPixel;
                for (var j = 0, len = coords.length; j < len; j++) {
                    ph.coords = coords[j];
                    ph.hidden = hiddenLines[j];
                    ph.boundsArr = boundsArr[j];
                    if (gmxAPIutils.isPointInLines(ph)) {
                        flag = true;
                        break;
                    }
                }
                if (!flag) continue;
            } else if(chktype === 'MULTILINESTRING') {
                ph.delta = lineWidth / mInPixel;
                ph.hidden = hiddenLines;
                if (!gmxAPIutils.isPointInLines(ph)) {
                    continue;
                }
            } else if(chktype === 'MULTIPOLYGON' || chktype === 'POLYGON') {
                var flag = false,
                    chkPoint = mercPoint,
                    pixels_map = dataOption.pixels || null,
                    flagPixels = pixels_map && pixels_map.z === gmx.currentZoom;
                if(flagPixels) {
                    coords = pixels_map.coords;
                    chkPoint = pixelPoint;
                }
                for (var j = 0, len = coords.length; j < len; j++) {
                    var b = boundsArr[j];
                    if(chktype === 'MULTIPOLYGON') b = b[0];
                    if (b.intersects(bounds)) {
                        if (gmxAPIutils.isPointInPolygonWithHoles(chkPoint, coords[j])) {
                            flag = true;
                            break;
                        }
                    }
                }
                if (!flag) continue;
            } else if(chktype === 'POINT') {
                coords = gmxAPIutils.getMarkerPolygon(dataOption.bounds, dx, dy);
                if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) continue;
            }

            out.push({ id: idr
                ,properties: item.properties
                ,geometry: geom
                ,bounds: item.bounds
            });
        }
        return out;
    },

    gmxEventCheck: function (ev, skipOver) {
        var layer = this,
            gmx = layer._gmx,
            type = ev.type,
            lastHover = gmx.lastHover,
            chkHover = function (evType) {
                if (lastHover && type === 'mousemove') {
                    if (layer.hasEventListeners(evType)) {
                        ev.gmx = lastHover;
                        layer.fire(evType, ev);
                    }
                    layer._redrawTilesHash(lastHover.gmxTiles);    // reset hover
                }
            };
        if (!skipOver &&
            (type === 'mousemove'
            || this.hasEventListeners('mouseover')
            || this.hasEventListeners('mouseout')
            || this.hasEventListeners(type)
            )) {
            var lng = ev.latlng.lng % 360,
                latlng = new L.LatLng(ev.latlng.lat, lng + (lng < -180 ? 360 : (lng > 180 ? -360 : 0))),
                mercatorPoint = L.Projection.Mercator.project(latlng),
                shiftXlayer = gmx.shiftXlayer || 0,
                shiftYlayer = gmx.shiftYlayer || 0,
                delta = 5 / gmx.mInPixel,
                bounds = gmxAPIutils.bounds([[mercatorPoint.x - shiftXlayer, mercatorPoint.y - shiftYlayer]]);
            bounds = bounds.addBuffer(delta, delta, delta, delta);
            var geoItems = gmx.vectorTilesManager.getItems(bounds, true);

            if (geoItems && geoItems.length) {
                var arr = this.gmxObjectsByPoint(geoItems, mercatorPoint);
                if (arr && arr.length) {
                    var target = arr[0],
                        changed = !lastHover || lastHover.id !== target.id;
                    if (type === 'mousemove' && lastHover) {
                        if (!changed) return target.id;
                        gmx.lastHover = null;
                        chkHover('mouseout');
                    }
                    var itemOptions = gmx.styleManager.getItemOptions(target),
                        filter = gmx.properties.styles[itemOptions.currentFilter],
                        templateBalloon = filter ? filter.Balloon : null;

                    ev.gmx = {
                        targets: arr
                        ,target: target
                        ,templateBalloon: templateBalloon
                        ,properties: gmxAPIutils.getPropertiesHash(target.properties, gmx.tileAttributeIndexes)
                        ,id: target.id
                    };
                    if (this.hasEventListeners(type)) this.fire(type, ev);
                    if (type === 'mousemove' && changed) {
                        lastHover = gmx.lastHover = ev.gmx;
                        lastHover.gmxTiles = layer._getTilesByBounds(target.bounds);
                        chkHover('mouseover');
                    }
                    this._map.doubleClickZoom.disable();
                    return target.id;
                }
            }
        }
        gmx.lastHover = null;
        chkHover('mouseout');
        this._map.doubleClickZoom.enable();
        return 0;
    },
    
    _getTilesByBounds: function (bounds) {    // Получить список gmxTiles по bounds
        var gmx = this._gmx,
            tileSize = gmx.tileSize,
            zoom = this._map._zoom,
            shiftX = gmx.shiftX || 0,   // Сдвиг слоя
            shiftY = gmx.shiftY || 0,   // Сдвиг слоя + OSM
            minLatLng = L.Projection.Mercator.unproject(new L.Point(bounds.min.x, bounds.min.y)),
            maxLatLng = L.Projection.Mercator.unproject(new L.Point(bounds.max.x, bounds.max.y)),
            minPoint = this._map.project(minLatLng),
            maxPoint = this._map.project(maxLatLng),
            screenBounds = this._map.getPixelBounds(),
            minY = Math.floor((Math.max(maxPoint.y, screenBounds.min.y) + shiftY)/256),
            maxY = 1 + Math.floor((Math.min(minPoint.y, screenBounds.max.y) + shiftY)/256),
            minX = maxLatLng.lng < -179 ? screenBounds.min.x : Math.max(minPoint.x, screenBounds.min.x),
            minX = Math.floor((minX + shiftX)/256),
            maxX = maxLatLng.lng > 179 ? screenBounds.max.x : Math.min(maxPoint.x, screenBounds.max.x),
            maxX = Math.floor((maxX + shiftX)/256),
            gmxTiles = {};
        for (var x = minX; x <= maxX; x++) {
            for (var y = minY; y <= maxY; y++) {
                var gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet({x: x, y: y}, zoom);
                gmxTiles[zoom + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y] = true;
            }
        }
        return gmxTiles;
    },
    redrawItem: function (id) {    // redraw Item
        var gmx = this._gmx,
            item = gmx.vectorTilesManager.getItem(id),
            gmxTiles = this._getTilesByBounds(item.bounds);
        this._redrawTilesHash(gmxTiles);    // reset hover
    },
    _redrawTilesHash: function (gmxTiles) {    // Перерисовать список gmxTiles тайлов на экране
        var zoom = this._map._zoom;
        for (var key in this._tiles) {
            var tile = this._tiles[key],
                tilePoint = tile._tilePoint,
                zkey = zoom + ':' + tilePoint.x + ':' + tilePoint.y,
                gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
                hashKey = zoom + '_' + gtp.x + '_' + gtp.y;
                
            if (hashKey in gmxTiles) {
                delete this._gmx.tileSubscriptions[zkey];
                this._addTile(tilePoint);
            }
        }
    },

    initLayerData: function(layerDescription) {     // обработка описания слоя
        var gmx = this._gmx,
            res = {items:{}, tileCount:0, itemCount:0},
            prop = layerDescription.properties,
            type = prop.type + (prop.Temporal ? 'Temporal' : '');

        gmx.items = {}, gmx.tileCount = 0, gmx.itemCount = 0;
		var cnt;
		if(type === 'VectorTemporal') {
            cnt = prop.TemporalTiles;
			gmx.TemporalColumnName = prop.TemporalColumnName;
			gmx.TemporalPeriods = prop.TemporalPeriods;
			var ZeroDateString = prop.ZeroDate || '01.01.2008';	// нулевая дата
			var arr = ZeroDateString.split('.');
			var zn = new Date(					// Начальная дата
				(arr.length > 2 ? arr[2] : 2008),
				(arr.length > 1 ? arr[1] - 1 : 0),
				(arr.length > 0 ? arr[0] : 1)
				);
			gmx.ZeroDate = new Date(zn.getTime()  - zn.getTimezoneOffset()*60000);	// UTC начальная дата шкалы
			gmx.ZeroUT = gmx.ZeroDate.getTime() / 1000;
		}
        
		gmx.tileCount = cnt;
		gmx.layerType = type;   // VectorTemporal Vector
		gmx.identityField = prop.identityField; // ogc_fid
		gmx.GeometryType = prop.GeometryType;   // тип геометрий обьектов в слое
		gmx.minZoomRasters = prop.RCMinZoomForRasters;// мин. zoom для растров
        if (!gmx.sortItems && gmx.GeometryType === 'polygon') {
            gmx.sortItems = function(a, b) { return Number(a.arr[0]) - Number(b.arr[0]); };
        }

        if('MetaProperties' in prop) {
            var meta = prop.MetaProperties;
            if('shiftX' in meta || 'shiftY' in meta) {  // сдвиг всего слоя
                gmx.shiftXlayer = meta.shiftX ? Number(meta.shiftX.Value) : 0;
                gmx.shiftYlayer = meta.shiftY ? Number(meta.shiftY.Value) : 0;
            }
            if('shiftXfield' in meta || 'shiftYfield' in meta) {    // поля сдвига растров объектов слоя
                if(meta.shiftXfield) gmx.shiftXfield = meta.shiftXfield.Value;
                if(meta.shiftYfield) gmx.shiftYfield = meta.shiftYfield.Value;
            }
            if('quicklookPlatform' in meta) {    // тип спутника
                gmx.quicklookPlatform = meta.quicklookPlatform.Value;
            }
        }

        if(prop.IsRasterCatalog) {
            gmx.IsRasterCatalog = prop.IsRasterCatalog;
            gmx.rasterBGfunc = function(x, y, z, item) {
                var properties = item.properties;
                return 'http://' + gmx.hostName
                    +'/TileSender.ashx?ModeKey=tile'
                    +'&x=' + x
                    +'&y=' + y
                    +'&z=' + z
                    +'&LayerName=' + properties[gmx.tileAttributeIndexes['GMX_RasterCatalogID']]
                    +'&MapName=' + gmx.mapName
                    +'&key=' + encodeURIComponent(gmx.sessionKey);
            };
            gmx.imageQuicklookProcessingHook = gmxImageTransform;
        }
        if(prop.Quicklook) {
			var template = gmx.Quicklook = prop.Quicklook;
			gmx.quicklookBGfunc = function(item) {
				var url = template;
				var reg = /\[([^\]]+)\]/;
				var matches = reg.exec(url);
				while(matches && matches.length > 1) {
					url = url.replace(matches[0], item.properties[gmx.tileAttributeIndexes[matches[1]]]);
					matches = reg.exec(url);
				}
				return url;
			};
			gmx.imageProcessingHook = gmxImageTransform;
		}

        if (prop.attributes) {
            var tileAttributeIndexes = {},
                attrs = prop.attributes;
            if (gmx.identityField) tileAttributeIndexes[gmx.identityField] = 0;
            for (var a = 0; a < attrs.length; a++) {
                tileAttributeIndexes[attrs[a]] = a + 1;
            }
            gmx.tileAttributeIndexes = tileAttributeIndexes;
        }

		return res;
	}
});
