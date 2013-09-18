﻿//Single tile on screen with vector data
var gmxScreenVectorTile = function(layer, tilePoint, zoom) {
    
	var gmx = layer._gmx;
	var tKey = tilePoint.x + ':' + tilePoint.y;
    var showRaster = 'rasterBGfunc' in gmx.attr &&
        (zoom >= gmx.attr.minZoomRasters);

    var rasters = {},
        gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
		gmxTileKey = gmxTilePoint.z + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y;
    
    //load all missing rasters for items we are going to render
    var getTileRasters = function(geoItems) {	// Получить растры КР для тайла
        var def = new gmxDeferred();
		var needLoadRasters = 0;
		var chkReadyRasters = function() {
			if(needLoadRasters < 1) {
				def.resolve();
			}
		}
        geoItems.forEach(function(geo) {
            var idr = geo.id;
            if (idr in rasters) return;
            var url = '';
            var itemImageProcessingHook = null;
            var item = gmx.vectorTilesManager.getItem(idr);
			if(gmx.attr['IsRasterCatalog']) {
				if(!item.properties['GMX_RasterCatalogID'] && item.properties['sceneid']) {
					url = 'http://search.kosmosnimki.ru/QuickLookImage.ashx?id=' + item.properties['sceneid'];
					itemImageProcessingHook = gmx.attr['imageQuicklookProcessingHook'];
				} else {		// RasterCatalog
					url = gmx.attr.rasterBGfunc(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z, idr)
				}
			} else if(item.properties['urlBG']) {
				url = item.properties['urlBG'];
				itemImageProcessingHook = gmx.attr['imageQuicklookProcessingHook'];
			} else if(gmx.attr['Quicklook']) {
				url = gmx.attr.rasterBGfunc(item);
				itemImageProcessingHook = gmx.attr['imageProcessingHook'];
			}
			if(url) {
				needLoadRasters++;

				gmxImageLoader.push({
					'callback' : function(img) {
						if(itemImageProcessingHook) {
							rasters[idr] = itemImageProcessingHook({
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
			}
		})
        chkReadyRasters();
        return def;
	}

	var styleCanvasKeys = ['strokeStyle', 'fillStyle', 'lineWidth']	// Ключи стилей в canvas
	var styleCanvasKeysLen = styleCanvasKeys.length;
	var lastStyles = {};
	var setCanvasStyle = function(item, dattr) {				// Установка canvas стилей
		var ctx = dattr['ctx'];
		var style = dattr['style'];
		var parsedStyleKeys = item['propHiden']['parsedStyleKeys'] || {};
		for (var i = 0; i < styleCanvasKeysLen; i++)
		{
			var key = styleCanvasKeys[i];
			var valKey = parsedStyleKeys[key] || style[key];
			if(key in style && valKey !== lastStyles[key]) {
                ctx[key] = lastStyles[key] = valKey;
            }
		}
	}

    this.drawTile = function() {
        var geoItems = gmx.vectorTilesManager.getItems(gmxTilePoint, zoom); //call each time because of possible items updates
        var itemsLength = geoItems.length;
        if(itemsLength === 0) {
			if (tKey in layer._tiles) {
				layer._tiles[tKey].getContext('2d').clearRect(0, 0, 256, 256);
			}
			// if(gmx.tileSubscriptions[gmxTileKey]) {
                // gmx.vectorTilesManager.off(gmx.tileSubscriptions[gmxTileKey]);
                // delete gmx.tileSubscriptions[gmxTileKey];
            // }
            // layer._tileLoaded();
			return 0;
		}

        geoItems = geoItems.sort(gmx.sortItems);
		var tile = layer.gmxGetCanvasTile(tilePoint);
		tile.id = gmxTileKey;
        var ctx = tile.getContext('2d');
        var dattr = {
                gmx: gmx,
                tpx: 256 * gmxTilePoint.x,
                tpy: 256 *(1 + gmxTilePoint.y),
                ctx: ctx
            };
        
        var doDraw = function() {
            ctx.clearRect(0, 0, 256, 256);
            for (var i = 0; i < itemsLength; i++) {
                var geoItem = geoItems[i],
                    idr = geoItem.id,
                    item = gmx.vectorTilesManager.getItem(idr);

                dattr.style = gmx.styleManager.getObjStyle(item); //call each time because of possible style can depends from item properties
				setCanvasStyle(item, dattr);

                if (rasters[idr]) {
                    dattr.bgImage = rasters[idr];
                }

                var geom = geoItem.geometry;
                if (geom.type === 'POLYGON' || geom.type === 'MULTIPOLYGON') {	// Отрисовка геометрии полигона
                    if(dattr.style.image) { // отображение мультиполигона маркером
                        dattr.coords = [(item.bounds.min.x + item.bounds.max.x)/2, (item.bounds.min.y + item.bounds.max.y)/2];
						gmxAPIutils.pointToCanvas(dattr);
                    } else {
                        var coords = geom.coordinates;
                        for (var j = 0, len1 = coords.length; j < len1; j++) {
                            var coords1 = coords[j];
                            dattr.hiddenLines = geoItem.hiddenLines[j];
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
                    var coords =  geom.coordinates;
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
            getTileRasters(geoItems).done(doDraw); //first load all raster images, then render all of them at once
        } else {
            doDraw();
        }
		return itemsLength;
    }
}