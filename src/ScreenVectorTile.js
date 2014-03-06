﻿//Single tile on screen with vector data
var gmxScreenVectorTile = function(layer, tilePoint, zoom) {
    
	var gmx = layer._gmx;
	var tKey = tilePoint.x + ':' + tilePoint.y;
    var showRaster = 'rasterBGfunc' in gmx &&
        (zoom >= gmx.minZoomRasters);

    var rasters = {},
        gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
		gmxTileKey = gmxTilePoint.z + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y;
		
	var loadRasterRecursion = function(gtp, urlFunction, callback) {
		var rUrl = urlFunction(gtp);

		var onError = function() {
			gmx.badTiles[rUrl] = true;
			if (gtp.z > 1) {
				// запрос по раззумливанию растрового тайла
				var nextGtp = {
					x: Math.floor(gtp.x/2),
					y: Math.floor(gtp.y/2),
					z: gtp.z - 1
				}
				loadRasterRecursion(nextGtp, urlFunction, callback);
			} else {
				callback(null);
			}
		};
		
		gmx.badTiles = gmx.badTiles || {};
		if(gmx.badTiles[rUrl]) {
			onError();
			return;
		}

		gmxImageLoader.push({
			src: rUrl
			,zoom: gtp.z
			,callback: function(imageObj) {
				callback(imageObj, gtp);
			}
			,onerror: onError
		});
	}

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
			var isTiles = false;
			if(gmx.IsRasterCatalog) {  // RasterCatalog
				if(!item.properties.GMX_RasterCatalogID && gmx.quicklookBGfunc) {
					url = gmx.quicklookBGfunc(item)
					itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
				} else {
					isTiles = true;
				}
			} else if(item.properties.urlBG) {
				url = item.properties.urlBG;
				itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
			} else if(gmx.Quicklook) {
				url = gmx.rasterBGfunc(item);
				itemImageProcessingHook = gmx.imageProcessingHook;
			}
			if(url || isTiles) {
				needLoadRasters++;
				
				if (isTiles) {
					loadRasterRecursion(gmxTilePoint,
						function(gtp) {
							return gmx.rasterBGfunc(gtp.x, gtp.y, gtp.z, item);
						},
						function(img, imageGtp) {
							needLoadRasters--;
							
							if (!img) {
								chkReadyRasters();
								return;
							}

							if( itemImageProcessingHook ) {
								img = itemImageProcessingHook({
									gmx: gmx,
									image: img,
									geoItem: geo,
									item: item,
									gmxTilePoint: imageGtp
								});
							}

							if (imageGtp.z !== gmxTilePoint.z) {
								var pos = gmxAPIutils.getTilePosZoomDelta(gmxTilePoint, gmxTilePoint.z, imageGtp.z);
								if(pos.size < 0.00390625) {// меньше 1px
									chkReadyRasters();
									return;
								}

								var canvas = document.createElement('canvas');
								canvas.width = canvas.height = 256;
								var ptx = canvas.getContext('2d');
								ptx.drawImage(img, Math.floor(pos.x), Math.floor(pos.y), pos.size, pos.size, 0, 0, 256, 256);
								rasters[idr] = canvas;
							} else {
								rasters[idr] = img;
							}
							chkReadyRasters();
						}
					);
				} else {
					gmxImageLoader.push({
						callback : function(img) {
							if(itemImageProcessingHook) {
								rasters[idr] = itemImageProcessingHook({
									gmx: gmx,
									image: img,
									geoItem: geo,
									item: item,
									gmxTilePoint: gmxTilePoint
								});
							} else {
								rasters[idr] = img;
							}
							needLoadRasters--;
							chkReadyRasters();
						}
						,onerror : function() {
							needLoadRasters--;
							chkReadyRasters();
						}
						,src: url
						//,'crossOrigin': 'anonymous'
					});
				}
			}
		})
        chkReadyRasters();
        return def;
	}

	var styleCanvasKeys = ['strokeStyle', 'fillStyle', 'lineWidth']	// Ключи стилей в canvas
	var styleCanvasKeysLen = styleCanvasKeys.length;
	var lastStyles = {};
	var setCanvasStyle = function(item, dattr) {				// Установка canvas стилей
		var ctx = dattr.ctx;
		var style = dattr.style;
		var gmx = dattr.gmx;

		var parsedStyleKeys = item.propHiden.parsedStyleKeys || {};
		for (var i = 0; i < styleCanvasKeysLen; i++)
		{
			var key = styleCanvasKeys[i];
			var valKey = parsedStyleKeys[key] || style[key];
			if(key in style && valKey !== lastStyles[key]) {
                ctx[key] = lastStyles[key] = valKey;
            }
        }
        if(style.dashes) {
            var dashes = style.dashes;
            var dashOffset = style.dashOffset || 0;
            if ('setLineDash' in ctx) {     //Chrome
                ctx.setLineDash(dashes);
                //ctx.lineDashOffset(dashOffset);
            } else {                        //Firefox
                ctx.mozDash = dashes;
                ctx.mozDashOffset = dashOffset;
            }            
        }

        if(parsedStyleKeys.canvasPattern) {
            ctx.fillStyle = ctx.createPattern(parsedStyleKeys.canvasPattern.canvas, "repeat");
        } else if(style.linearGradient) {
            var rgr = style.linearGradient;
            var x1 = rgr.x1Function ? rgr.x1Function(prop) : rgr.x1;
            var y1 = rgr.y1Function ? rgr.y1Function(prop) : rgr.y1;
            var x2 = rgr.x2Function ? rgr.x2Function(prop) : rgr.x2;
            var y2 = rgr.y2Function ? rgr.y2Function(prop) : rgr.y2;
            var lineargrad = ctx.createLinearGradient(x1,y1, x2, y2);  
            for (var i = 0, len = style.linearGradient.addColorStop.length; i < len; i++)
            {
                var arr1 = style.linearGradient.addColorStop[i];
                var arrFunc = style.linearGradient.addColorStopFunctions[i];
                var p0 = (arrFunc[0] ? arrFunc[0](prop) : arr1[0]);
                var p2 = (arr1.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop) : arr1[2]));
                var p1 = gmxAPIutils.dec2rgba(arrFunc[1] ? arrFunc[1](prop) : arr1[1], p2/100);
                lineargrad.addColorStop(p0, p1);
            }
            ctx.fillStyle = lineargrad; 
        }
    }

    var getObjectsByPoint = function(arr, point) {    // Получить верхний обьект по координатам mouseClick
        var mInPixel = gmx.mInPixel;
        var mercPoint = [point[0] / mInPixel, point[1] / mInPixel];
        var bounds = gmxAPIutils.bounds([mercPoint]);
        var getMarkerPolygon = function(mb, dx, dy) {    // Получить полигон по bounds маркера
            var center = [(mb.min.x + mb.max.x) / 2, (mb.min.y + mb.max.y) / 2];
            return [
                [center[0] - dx, center[1] - dy]
                ,[center[0] - dx, center[1] + dy]
                ,[center[0] + dx, center[1] + dy]
                ,[center[0] + dx, center[1] - dy]
                ,[center[0] - dx, center[1] - dy]
            ];
        }
        
        for (var i = arr.length - 1; i >= 0; i--) {
            var geoItem = arr[i],
                idr = geoItem.id,
                item = gmx.vectorTilesManager.getItem(idr),
                parsedStyle = item.propHiden.parsedStyleKeys,
                lineWidth = parsedStyle.lineWidth || 0,
                dx = (parsedStyle.sx + lineWidth) / mInPixel,
                dy = (parsedStyle.sy + lineWidth) / mInPixel;
            if (!geoItem.bounds.intersects(bounds, dx, dy)) continue;

            var type = geoItem.geometry.type;
            var coords = geoItem.geometry.coordinates;
            if(type === 'LINESTRING') {
                if (!gmxAPIutils.chkPointInPolyLine(mercPoint, lineWidth / mInPixel, coords)) continue;
            } else if(type === 'MULTILINESTRING') {
                var flag = false;
                for (var j = 0, len = coords.length; j < len; j++) {
                    if (gmxAPIutils.chkPointInPolyLine(mercPoint, lineWidth / mInPixel, coords[j])) {
                        flag = true;
                        break;
                    }
                }
                if (!flag) continue;
            } else {
                if(type === 'MULTIPOLYGON') {
                    if(parsedStyle.marker) {
                        coords = getMarkerPolygon(geoItem.bounds, dx, dy);
                        if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) continue;
                    } else {
                        var flag = false;
                        for (var j = 0, len = coords.length; j < len; j++) {
                            if (gmxAPIutils.isPointInPolygonArr(mercPoint, coords[j][0])) {
                                flag = true;
                                break;
                            }
                        }
                        if (!flag) continue;
                    }
                } else if(type === 'POLYGON') {
                    coords = (parsedStyle.marker ? getMarkerPolygon(geoItem.bounds, dx, dy) : coords[0]);
                    if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) continue;
                } else if(type === 'POINT') {
                    coords = getMarkerPolygon(geoItem.bounds, dx, dy);
                    if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) continue;
                }
            }
            
            return { id: idr
                ,properties: item.properties
                ,geometry: geoItem.geometry
                ,crs: 'EPSG:3395'
                ,latlng: L.Projection.Mercator.unproject({'x':bounds.min.x, 'y':bounds.min.y})
            };
		}
        return null;
    }

    this.drawTile = function() {
        var geoItems = gmx.vectorTilesManager.getItems(gmxTilePoint, zoom); //call each time because of possible items updates
        var itemsLength = geoItems.length;
        if(itemsLength === 0) {
			if (tKey in layer._tiles) {
				layer._tiles[tKey].getContext('2d').clearRect(0, 0, 256, 256);
			}
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
            //var labels = {};
            for (var i = 0; i < itemsLength; i++) {
                var geoItem = geoItems[i],
                    idr = geoItem.id,
                    item = gmx.vectorTilesManager.getItem(idr),
                    style = gmx.styleManager.getObjStyle(item); //call each time because of possible style can depends from item properties

                dattr.style = style.RenderStyle;
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
                        dattr.flagPixels = false;
                        var coords = geom.coordinates;
                        if(geom.type === 'POLYGON') coords = [coords];
                        var hiddenLines = geoItem.hiddenLines;

                        var flagPixels = geoItem.pixels && geoItem.pixels.z === gmx.currentZoom;
                        var cacheArr = [];
                        var coordsToCanvas = function(func) {
                            var out = null;
                            if(flagPixels) {
                                coords = geoItem.pixels.coords;
                                hiddenLines = geoItem.pixels.hidden;
                                dattr.flagPixels = flagPixels;
                            } else {
                                out = { coords: [], hidden: [] };
                            }
                            var pixels = [], hidden = [];
                            for (var j = 0, len1 = coords.length; j < len1; j++) {
                                var coords1 = coords[j];
                                var hiddenLines1 = hiddenLines[j];
                                for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                                    dattr.coords = coords1[j1];
                                    dattr.hiddenLines = hiddenLines1[j1];
                                    var res = func(dattr);
                                    if(out && res) {
                                        pixels.push(res.coords);
                                        hidden.push(res.hidden);
                                    }
                                }
                            }
                            if(out) {
                                out.coords.push(pixels);
                                out.hidden.push(hidden);
                            }
                            return out;
                        }
                        if(dattr.style.strokeStyle && dattr.style.lineWidth) {
                            var pixels = coordsToCanvas(gmxAPIutils.polygonToCanvas, flagPixels);
                            if(pixels) {
                                geoItem.pixels = pixels;
                                geoItem.pixels.z = gmx.currentZoom;
                                flagPixels = true;
                            }
                        }
                        if(dattr.style.fill) {
                            if(flagPixels) {
                                coords = geoItem.pixels.coords;
                                hiddenLines = geoItem.pixels.hidden;
                            }
                            coordsToCanvas(gmxAPIutils.polygonToCanvasFill, flagPixels);
                        }
                    }
                    // if(dattr.style.label) {
                        // labels[idr] = {
                            // item: item
                            // ,style: dattr.style
                        // };
                    // }
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
            /*
            // TODO: Need labels manager
            for (var idr in labels) {
                var label = labels[idr];
                var item = label.item;
                dattr.style = label.style;
                dattr.coords = [(item.bounds.min.x + item.bounds.max.x)/2, (item.bounds.min.y + item.bounds.max.y)/2];
                var txt = item.properties[dattr.style.label.field];
                var parsedStyleKeys = item.propHiden.parsedStyleKeys.label || {};
                //dattr.extentLabel = gmxAPIutils.getLabelSize(txt, parsedStyleKeys);
                gmxAPIutils.setLabel(txt, dattr, parsedStyleKeys);
            }*/
        }
        
        if (showRaster) {
            getTileRasters(geoItems).then(doDraw); //first load all raster images, then render all of them at once
        } else {
            doDraw();
        }
		return itemsLength;
    }
}