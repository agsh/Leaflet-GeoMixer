﻿var gmxStyleManager = function(gmx) {
    var MAX_STYLE_SIZE = 256,
        needLoadIcons = 0,
        styles = [],
        imagesSize = {},
        defaultStyle = {lineWidth: 1, strokeStyle: 'rgba(0, 0, 255, 1)'},
        me = this;

    this.deferred = new gmxDeferred()
    var initStyles = function() {
        var props = gmx.properties,
            arr = props.styles;

		for (var i = 0, len = arr.length; i < len; i++) {
			styles.push(parseItem(gmx.styles[i] || arr[i]));
		}
 
		for (var j = i, len = gmx.styles.length; j < len; j++) {
			styles.push(parseItem(gmx.styles[j]));
		}
   }

    var parseItem = function(style) {			// перевод Style Scanex->leaflet
        var pt = {
			'common': true					// true, false - true - если стиль не зависит от properties обьекта
			,'MinZoom': style['MinZoom']
			,'MaxZoom': style['MaxZoom']
			,'Filter': style['Filter'] || null
			,'onMouseOver': !style['DisableBalloonOnMouseMove']
			,'onMouseClick': !style['DisableBalloonOnClick']
			,'BalloonEnable': style['BalloonEnable'] || false
			,'sx': 0
			,'sy': 0
		};
		if('Filter' in style) {
            var ph = gmxParsers.parseSQL(style['Filter']);
            if(ph) pt['FilterFunction'] = ph;
        }

		if('RenderStyle' in style) {
			var st = style.RenderStyle;
			pt['label'] = false;
			if(typeof(st['label']) === 'object') {					//	Есть стиль label
				pt['label'] = {};
				var ph = st['label'];
				if('color' in ph) pt['label']['color'] = ph['color'];
				if('haloColor' in ph) pt['label']['haloColor'] = ph['haloColor'];
				if('size' in ph) pt['label']['size'] = ph['size'];
				if('spacing' in ph) pt['label']['spacing'] = ph['spacing'];
				if('align' in ph) pt['label']['align'] = ph['align'];
				if('dx' in ph) pt['label']['dx'] = ph['dx'];
				if('dy' in ph) pt['label']['dy'] = ph['dy'];
				if('field' in ph) pt['label']['field'] = ph['field'];
			}
			pt['marker'] = false;
			var isMarker = (typeof(st['marker']) === 'object' ? true : false);
			
			if(isMarker) {				//	Есть стиль marker
				if('size' in st['marker']) pt['size'] = st['marker']['size'];
				if('circle' in st['marker']) pt['circle'] = st['marker']['circle'];
				if('center' in st['marker']) pt['center'] = st['marker']['center'];
				if('scale' in st['marker']) pt['scale'] = st['marker']['scale'];
			}
			if(isMarker && 'image' in st['marker']) {				//	Есть image у стиля marker
				pt['marker'] = true;
				var ph = st['marker'];
				if('color' in ph) pt['color'] = ph['color'];
				pt['opacity'] = ('opacity' in ph ? ph['opacity']/100 : 1);
				if('size' in ph) pt['size'] = ph['size'];
				if('scale' in ph) pt['scale'] = ph['scale'];
				if('minScale' in ph) pt['minScale'] = ph['minScale'];
				if('maxScale' in ph) pt['maxScale'] = ph['maxScale'];
				if('angle' in ph) pt['rotate'] = ph['angle'];
				if('image' in ph) {
					pt['iconUrl'] = ph['image'];
					getImageSize(pt, true, '');
				}
				
				if('center' in ph) pt['center'] = ph['center'];
				if('dx' in ph) pt['dx'] = ph['dx'];
				if('dy' in ph) pt['dy'] = ph['dy'];
				
			} else {
				pt['fill'] = false;
				if(typeof(st['fill']) === 'object') {					//	Есть стиль заполнения
					pt['fill'] = true;
					var ph = st['fill'];
					if('color' in ph) pt['fillColor'] = ph['color'];
					pt['fillOpacity'] = ('opacity' in ph ? ph['opacity']/100 : 1);
					if('pattern' in ph) {
						var pattern = ph['pattern'];
						delete pattern['_res'];
						pt['pattern'] = pattern;
						if('step' in pattern && typeof(pattern['step']) === 'string') {
							pattern['patternStepFunction'] = gmxParsers.parseExpression(pattern['step']);
							pt['common'] = false;
						}
						if('width' in pattern && typeof(pattern['width']) === 'string') {
							pattern['patternWidthFunction'] = gmxParsers.parseExpression(pattern['width']);
							pt['common'] = false;
						}
						if('colors' in pattern) {
							var arr = [];
							for (var i = 0; i < pattern.colors.length; i++)
							{
								var rt = pattern.colors[i];
								if(typeof(rt) === 'string') {
                                    arr.push(gmxParsers.parseExpression(rt));
                                    pt['common'] = false;
                                } else {
                                    arr.push(null);
                                }
							}
							pattern['patternColorsFunction'] = arr;
						}
                        if(pt['common']) pt['canvasPattern'] = gmxAPIutils.getPatternIcon(null, pt);
					} else if(typeof(ph['radialGradient']) === 'object') {
						pt['radialGradient'] = ph['radialGradient'];
						//	x1,y1,r1 — координаты центра и радиус первой окружности;
						//	x2,y2,r2 — координаты центра и радиус второй окружности.
						//	addColorStop - стоп цвета объекта градиента [[position, color]...]
						//		position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
						//		color — код цвета или формула.
						//		opacity — прозрачность
						var arr = ['r1', 'x1', 'y1', 'r2', 'x2', 'y2'];
						for (var i = 0; i < arr.length; i++)
						{
							var it = arr[i];
							pt['radialGradient'][it] = (it in ph['radialGradient'] ? ph['radialGradient'][it] : 0);
							if(typeof(pt['radialGradient'][it]) === 'string') {
								pt['radialGradient'][it+'Function'] = gmxParsers.parseExpression(pt['radialGradient'][it]);
								pt['common'] = false;
							}
						}
						
						pt['radialGradient']['addColorStop'] = ph['radialGradient']['addColorStop'] || [[0, 0xFF0000], [1, 0xFFFFFF]];
						pt['radialGradient']['addColorStopFunctions'] = [];
						for (var i = 0; i < pt['radialGradient']['addColorStop'].length; i++)
						{
							var arr = pt['radialGradient']['addColorStop'][i];
							pt['radialGradient']['addColorStopFunctions'].push([
								(typeof(arr[0]) === 'string' ? gmxParsers.parseExpression(arr[0]) : null)
								,(typeof(arr[1]) === 'string' ? gmxParsers.parseExpression(arr[1]) : null)
								,(typeof(arr[2]) === 'string' ? gmxParsers.parseExpression(arr[2]) : null)
							]);
						}
                        pt['size'] = pt['circle'] = Math.max(pt['radialGradient']['r1'], pt['radialGradient']['r2']);
					} else if(typeof(ph['linearGradient']) === 'object') {
						pt['linearGradient'] = ph['linearGradient'];
						//	x1,y1 — координаты начальной точки
						//	x2,y2 — координаты конечной точки
						//	addColorStop - стоп цвета объекта градиента [[position, color]...]
						//		position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
						//		color — код цвета или формула.
						//		opacity — прозрачность
						var arr = ['x1', 'y1', 'x2', 'y2'];
						for (var i = 0; i < arr.length; i++)
						{
							var it = arr[i];
							pt['linearGradient'][it] = (it in ph['linearGradient'] ? ph['linearGradient'][it] : 0);
							if(typeof(pt['linearGradient'][it]) === 'string') {
								pt['linearGradient'][it+'Function'] = gmxParsers.parseExpression(pt['linearGradient'][it]);
								pt['common'] = false;
							}
						}
						
						pt['linearGradient']['addColorStop'] = ph['linearGradient']['addColorStop'] || [[0, 0xFF0000], [1, 0xFFFFFF]];
						pt['linearGradient']['addColorStopFunctions'] = [];
						for (var i = 0; i < pt['linearGradient']['addColorStop'].length; i++)
						{
							var arr = pt['linearGradient']['addColorStop'][i];
							pt['linearGradient']['addColorStopFunctions'].push([
								(typeof(arr[0]) === 'string' ? gmxParsers.parseExpression(arr[0]) : null)
								,(typeof(arr[1]) === 'string' ? gmxParsers.parseExpression(arr[1]) : null)
								,(typeof(arr[2]) === 'string' ? gmxParsers.parseExpression(arr[2]) : null)
							]);
						}
					}
                    if('fillColor' in pt) {
                        pt['fillStyle'] = gmxAPIutils.dec2rgba(pt['fillColor'], pt['fillOpacity']);
                    }
				}
				pt['stroke'] = false;
				if(typeof(st['outline']) === 'object') {				//	Есть стиль контура
					pt['stroke'] = true;
					var ph = st['outline'];
					pt['lineWidth'] = ph.thickness || 0;
					if('dashes' in ph) pt['dashArray'] = ph['dashes'];
                    if('opacity' in ph && typeof(ph['opacity']) === 'string') {
                        pt['opacityFunction'] = gmxParsers.parseExpression(ph['opacity']);
                        pt['common'] = false;
                    } else {
                        var color = ph.color || 255;
                        var opacity = ('opacity' in ph ? ph['opacity']/100 : 1);
                        pt['strokeStyle'] = gmxAPIutils.dec2rgba(color, opacity);
                    }
				}
			}
			if('rotate' in pt && typeof(pt['rotate']) === 'string') {
				pt['rotateFunction'] = gmxParsers.parseExpression(pt['rotate']);
				pt['common'] = false;
			}
			if('scale' in pt && typeof(pt['scale']) === 'string') {
				pt['scaleFunction'] = gmxParsers.parseExpression(pt['scale']);
				pt['common'] = false;
			}
			if('color' in pt && typeof(pt['color']) === 'string') {
				pt['colorFunction'] = gmxParsers.parseExpression(pt['color']);
				pt['common'] = false;
			}
			if('fillColor' in pt && typeof(pt['fillColor']) === 'string') {
				pt['fillColorFunction'] = gmxParsers.parseExpression(pt['fillColor']);
				pt['common'] = false;
			}
			if('size' in pt) {
                if(typeof(pt['size']) === 'string') {
                    pt['sizeFunction'] = gmxParsers.parseExpression(pt['size']);
                    pt['common'] = false;
                } else {
                    pt['sx'] = pt['sy'] = pt['size'];
                }
			}
			
		}
		return pt;
    }
	var getImageSize = function(pt, flag, id)	{				// определение размеров image
		var url = pt['iconUrl'];
		var chkReadyIcons = function() {
			if(needLoadIcons < 1) {
				me.deferred.resolve();
			}
		}

		needLoadIcons++;
		var ph = {
			'src': url
			,'callback': function(it, svgFlag) {
				pt['sx'] = it.width / 2;
				pt['sy'] = it.height / 2;
				if(svgFlag) {
					pt['polygons'] = it.polygons;
				} else {
					if(flag) pt['image'] = it;
				}
				imagesSize[url] = pt;
				needLoadIcons--;
				chkReadyIcons();
			}
			,'onerror': function(){
				pt['sx'] = 1;
				pt['sy'] = 0;
				pt['image'] = null;
				imagesSize[url] = pt;
				needLoadIcons--;
				chkReadyIcons();
				console.log({'url': url, 'func': 'getImageSize', 'Error': 'image not found'});
			}
		};
		if(('color' in pt && pt['color'] != utils.DEFAULT_REPLACEMENT_COLOR)
			|| 'rotate' in pt
		) ph['crossOrigin'] = 'anonymous';
		gmxImageLoader.unshift(ph);
	}
    
/*
    this.setStyle = function(st, num) {
		var tt = Number(num);
		var tt = Number(num);
        //if(num !== && num < styles.length
    }
*/
    var ItemStyleParser = function(item, pt) {
		var out = {},
            prop = item.properties,
            propHiden = item.propHiden,
            color = 255, opacity = 1;

        out['sx'] = pt['sx'];
        out['sy'] = pt['sy'];
		if(pt['marker']) {
            out['marker'] = pt['marker'];
            if(pt['image']) out['image'] = pt['image'];
        }

		if(pt['size']) {
            out['size'] = ('sizeFunction' in pt ? pt['sizeFunction'](prop) : pt['size']);
            out['sx'] = out['size'];
            out['sy'] = out['size'];
        }

		if(pt['stroke']) {
            out['stroke'] = pt['stroke'];
            color = ('colorFunction' in pt ? pt['colorFunction'](prop) : pt['color'] || 255);
            opacity = ('opacityFunction' in pt ? pt['opacityFunction'](prop)/100 : pt['opacity'] || 1);
            out['strokeStyle'] = gmxAPIutils.dec2rgba(color, opacity);
            out['lineWidth'] = pt['lineWidth'] || 1;
        }

		if(pt['fill']) {
            out['fill'] = pt['fill'];
			if(pt['pattern']) {
                out['canvasPattern'] = (pt['canvasPattern'] ? pt['canvasPattern'] : gmxAPIutils.getPatternIcon(item, pt));
            } else {
                color = ('fillColorFunction' in pt ? pt['fillColorFunction'](prop) : pt['fillColor'] || 255);
                opacity = ('fillOpacityFunction' in pt ? pt['fillOpacityFunction'](prop)/100 : pt['fillOpacity'] || 1);
                out['fillStyle'] = gmxAPIutils.dec2rgba(color, opacity);
            }
        }
		propHiden.parsedStyleKeys = out;
        return out;
    }

    var chkStyleFilter = function(item) {
		for (var i = 0, len = styles.length; i < len; i++) {
			var st = styles[i];
			if (gmx.currentZoom > st.MaxZoom || gmx.currentZoom < st.MinZoom) continue;
			if ('FilterFunction' in st && !st['FilterFunction'](item.properties)) continue;
			if(item.propHiden.currentFilter !== i) {
                ItemStyleParser(item, st);
            }

            item.propHiden.currentFilter = i;
            return true;
		}
        return false;
    }

    gmx.vectorTilesManager.setFilter('styleFilter', chkStyleFilter);
 
    // только для item прошедших через chkStyleFilter
    this.getObjStyle = function(item) {
		var style = styles[item.propHiden.currentFilter];
        ItemStyleParser(item, style);
        return style;
    }

    // estimete style size for arbitrary object
    this.getMaxStyleSize = function(zoom) {
		if (!zoom) zoom = gmx.currentZoom;
		var maxSize = 0;
		for (var i = 0, len = styles.length; i < len; i++) {
			var style = styles[i];
			if (zoom > style.MaxZoom || zoom < style.MinZoom) continue;
			if (!style['common'] || needLoadIcons) {
				maxSize = MAX_STYLE_SIZE;
				break;
			}
			maxSize = Math.max(maxSize, 2 * style.sx, 2 * style.sy);
		}
		return maxSize;
    }

    initStyles();
    if(needLoadIcons < 1) this.deferred.resolve();
}