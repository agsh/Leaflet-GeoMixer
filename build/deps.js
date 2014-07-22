﻿var deps = [
    "Parsers.js", 
    "Deferred.js",
    "ImageLoader.js",
    "ProjectiveImage.js",
    "StyleManager.js",
    "ScreenVectorTile.js",
    "VectorTile.js",
    "DataManager.js",
    "gmxAPIutils.js",
    "gmxImageTransform.js",
    "SessionManager.js",
    "MapManager.js",
    "gmxEventsManager.js",
    "VectorTileLoader.js",
    "gmxVectorLayer.js",
    "gmxVectorLayer.Popup.js",
    "gmxRasterLayer.js",
    "gmxLayerFactory.js",
    "L.gmxLocale.js",
    "lang_ru.js",
    "lang_en.js"
];

if (typeof exports !== 'undefined') {
	exports.deps = deps;
}

if (typeof gmxDevOnLoad === 'function') {
	gmxDevOnLoad(deps);
}