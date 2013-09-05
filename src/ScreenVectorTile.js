﻿//Single tile on screen with vector data
var gmxScreenVectorTile = function(layer, tilePoint, zoom) {
    
	var gmx = layer._gmx;
	var tKey = tilePoint.x + ':' + tilePoint.y;
    var showRaster = 'rasterBGfunc' in gmx.attr &&
        (zoom >= gmx.attr.minZoomRasters);

    var rasters = {},
        gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
		gmxTileKey = gmxTilePoint.z + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y,
        bounds = gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z);
    
    //load all missing rasters for items we are going to render
    var getTileRasters = function(items) {	// Получить растры КР для тайла
        var def = new gmxDeferred();
		var needLoadRasters = 0;
		var chkReadyRasters = function() {
			if(needLoadRasters < 1) {
				def.resolve();
			}
		}
        items.forEach(function(geo) {
            var idr = geo.id;
            if (idr in rasters) return;
			needLoadRasters++;
            var url = '';
            var item = null;
			if(gmx.attr['Quicklook']) {
				item = gmx.vectorTilesManager.getItem(idr);
				url = gmx.attr.rasterBGfunc(item);
			} else {
				url = gmx.attr.rasterBGfunc(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z, idr)
			}

            gmxImageLoader.push({
                'callback' : function(img) {
					if(gmx.attr['imageProcessingHook']) {
						rasters[idr] = gmx.attr['imageProcessingHook']({
							'image': img,
							'geoItem': geo,
							'item': item,
							'gmxTilePoint': gmxTilePoint
						});
					} else {
						rasters[idr] = img;
					}
                    needLoadRasters--;
                    chkReadyRasters();
                }
                ,'onerror' : function() {
                    needLoadRasters--;
                    chkReadyRasters();
                }
                ,'src': url
            });
		})
        chkReadyRasters();
        return def;
	}

    this.drawTile = function(style) {
        var items = gmx.vectorTilesManager.getItems(gmxTilePoint, style); //call each time because of possible items updates
        if(items.length === 0) {
			if (tKey in layer._tiles) {
				layer._tiles[tKey].getContext('2d').clearRect(0, 0, 256, 256);
			}
			gmx.vectorTilesManager.off(gmx.tileSubscriptions[gmxTileKey]);
			delete gmx.tileSubscriptions[gmxTileKey];
			return;
		}

        items = items.sort(gmx.sortItems);
		var tile = layer.gmxGetCanvasTile(tilePoint);
		tile.id = gmxTileKey;
        var ctx = tile.getContext('2d');
        var dattr = {
                gmx: gmx,
                style: style,
                tpx: 256 * gmxTilePoint.x,
                tpy: 256 *(1 + gmxTilePoint.y),
                ctx: ctx
            };
        
        var doDraw = function() {
            ctx.clearRect(0, 0, 256, 256);
            for (var i = 0, len = items.length; i < len; i++) {
                var it = items[i],
                    idr = it.id;
                    
                if (rasters[idr]) {
                    dattr.bgImage = rasters[idr];
                }

                var geom = it.geometry;
                if (geom.type === 'POLYGON' || geom.type === 'MULTIPOLYGON') {	// Отрисовка геометрии полигона
                    var coords = geom.coordinates;
                    for (var j = 0, len1 = coords.length; j < len1; j++) {
                        var coords1 = coords[j];
                        dattr.hiddenLines = it.hiddenLines[j];
                        if(geom.type === 'MULTIPOLYGON') {
                            for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                                dattr.coords = coords1[j1];
                                gmxAPIutils.polygonToCanvas(dattr);
                            }
                        } else {
                            dattr.coords = coords1;
                            gmxAPIutils.polygonToCanvas(dattr);
                        }
                    }
                } else if (geom.type === 'LINESTRING' || geom.type === 'MULTILINESTRING') {	// Отрисовка геометрии линий
                    var coords = geom.coordinates;
                    if(geom.type === 'MULTILINESTRING') {
                        for (var j = 0, len1 = coords.length; j < len1; j++) {
                            dattr.coords = coords[j];
                            gmxAPIutils.lineToCanvas(dattr);
                        }
					} else {
						dattr.coords = coords;
						gmxAPIutils.lineToCanvas(dattr);
                    }
                } else if (geom.type === 'POINT' || geom.type === 'MULTIPOINT') {	// Отрисовка геометрии точек
                    var coords = geom.coordinates;
                    if(geom.type === 'MULTIPOINT') {
                        for (var j = 0, len1 = coords.length; j < len1; j++) {
                            dattr.coords = coords[j];
                            gmxAPIutils.pointToCanvas(dattr);
                        }
					} else {
						dattr.coords = coords;
						gmxAPIutils.pointToCanvas(dattr);
                    }
                }
            }
        }
        
        if (showRaster) {
            getTileRasters(items).done(doDraw); //first load all raster images, then render all of them at once
        } else {
            doDraw();
        }
    }
}