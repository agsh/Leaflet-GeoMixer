# Документация плагина Leaflet-GeoMixer

Leaflet-GeoMixer - плагин для интеграции данных с серверов GeoMixer в любую карту, созданную с использованием библиотеки Leaflet. 
Плагин добавляет несколько новых классов для работы с данными и функции для создания экземпляра этих классов.

## Простой пример

```html
	<div id="map"></div>
 
	<script src="http://cdn.leafletjs.com/leaflet-0.6.4/leaflet-src.js"></script>
	<script src="leaflet-geomixer.js?key=U92596WMIH"></script>
	<script>
		var map = L.map('map').setView([60, 50], 3);
		
		L.gmx.loadLayer('7VKHM', '295894E2A2F742109AB112DBFEAEFF09').then(function(satelliteLayer) {
		    satelliteLayer.addTo(map);
		});
		
        L.gmx.loadMap('AZR6A', {leafletMap: map});
	</script>
```

## Добавление плагина

Чтобы добавить плагин, просто загрузите JS файл на вашей странице:

```html
<script src="leaflet-geomixer.js?key=GeoMixerAPIKey"></script>
```

`GeoMixerAPIKey` - это специальный ключ, который должен быть получен для каждого домена, на котором загружаются данные из GeoMixer'а. 
Этот ключ может быть указан как параметр к подключаемому скрипту или передан как параметр при загрузке слоёв.

## Структуры данных в GeoMixer

Основной сущностью в GeoMixer является **слой**. Каждый слой имеет ряд свойств, включающих в себя `ID`, `type` и`title`.
ID слоя уникально в пределах одного сервера. Основными типами слоёв являются **векторные** и **растровые**.

Каждый векторный слой состоит из геометрических объектов. Объекты имеют следующие атрибуты: `type`, `geometry` и `properties`. 

Слои в GeoMixer-е объединяются в **карты**.

## Загрузка слоёв

Слои загружаются при помощи фабричных методов в асинхронном режиме. Для удобной работы с асинхронными операциями в плагине активно используются промисы ([Promises](https://promisesaplus.com/)).

Есть несколько способов загрузить слой.

### L.gmx.loadLayer
```js
L.gmx.loadLayer(mapID, layerID, options): Promise
```

`mapID` - ID карты GeoMixer-а, а `layerID` - ID слоя в этой карте.

`options` - хеш дополнительных параметров со следующими возможными ключами.

Параметр|Описание|Тип|Значение по умолчанию
------|-----------|:--:|-------------
hostName| Хост сервера GeoMixer (без `http://` и `/` в конце)|`String`|maps.kosmosnimki.ru
apiKey|Ключ для загрузки данных. Также может быть задан один раз при подключении скрипта плагина (см. выше). Для работы с `localhost` ключ не требуется. Для серверов, которые не поддерживают API-ключи, этот параметр нужно явно установить в `null`|`String` или `null`|
beginDate|Начальная дата временного интервала (только для мультивременных слоёв)|`Date`|
endDate|Конечная дата временного интервала (только для мультивременных слоёв)|`Date`|

Функция возвращает Promise, который будет выполнен с экземпляром слоя (`L.gmx.VectorLayer` или `L.gmx.RasterLayer`) в качестве первого параметра. Этот экземпляр может быть использован для добавления слоя на карту, настройки отображения и т.п.

#### Пример
```js
L.gmx.loadLayer('7VKHM', '295894E2A2F742109AB112DBFEAEFF09').then(function(satelliteLayer) {
    //...
});
```

### L.gmx.loadLayers
```js
 L.gmx.loadLayers(layers, commonOptions): Promise
```

Вспомогательная функция для загрузки сразу нескольких слоёв. `layers` - массив объектов со следующими свойствами:
  * mapID - ID карты 
  * layerID - ID слоя
  * options - дополнительные опции слоя

Каждый элемент массива соответвтует отдельному вызову `L.gmx.loadLayer`. `commonOptions` применяются ко всем слоям.
Возвращает Promise, который будет выполнен (fulfill) после загрузки всех слоёв. Слои передаются как отдельные параметры.

### L.gmx.loadMap
```js
 L.gmx.loadMap(mapID, options): Promise
```
Загружает все слои из определённой карты GeoMixer-а.

`options` - набор общих параметров слоёв (см. `L.gmx.loadLayer()`). Кроме них, можно указывать следующие дополнительные параметры.

Параметр|Описание|Тип
------|-----------|:--:|-------------
leafletMap| Карта Leaflet для добавления к ней всех слоёв, включённых в исходной карте GeoMixer-а |`L.Map`
setZIndex| Задать z-индексы создаваемых слоёв в соответствии с порядоком слоёв в карте GeoMixer-а (в том числе, векторные слои всегда будут над растровыми)|`Boolean`

Функция возвращает Promise, который выполняется (fulfilled) при загрузке всех слоёв. При этом в ф-ции выполнения передаётся объект типа `L.gmx.Map`.

## Класс L.gmx.VectorLayer

Класс `gmxVectorLayer` предоставляет интерфейс для рендеринга векторных слоёв GeoMixer-а на карте Leaflet.
Слои могут быть добавлены к карте стандартным способом при помощи ф-ций `L.Map.addLayer()` или `L.gmx.VectorLayer.addTo()`.

### Методы
Метод|Синтаксис|Возвращаемое значение|Описание
------|------|:---------:|-----------
setFilter|`setFilter(function(item): Boolean)`|`this`| Установить ф-цию для фильтрации объектов перед рендерингом. Единственный аргумент - ф-ция, которая получает объект из слоя и возвращает булево значение (`false` - отфильтровать)
removeFilter|`removeFilter()`||Удалить ф-цию фильтрации объектов перед рендерингом.
setDateInterval|`setDateInterval(beginDate, endDate)`|`this`|Задаёт временной интервал для мультиврменных слоёв. Только объекты из этого интервала будут загружены и показаны на карте. `beginDate` и `endDate` имеют тип `Date`.
bindPopup|`bindPopup(html <String> `&#124;` el <HTMLElement> `&#124;` popup <Popup>, options <Popup options>? )`|`this`| Показывает баллун по клику на объекте слоя.
repaint|`repaint()` ||Перерисовать слой. В отличае от `L.TileLayer.redraw()`, не пересоздаёт тайлы слоя, а лишь перерисовывает их. Работает быстрее и без моргания слоя на экране.
redrawItem|`redrawItem(<UInt>)` ||Перерисовать объект слоя.
setImageProcessingHook|`setImageProcessingHook( function(image, options): Canvas `&#124;` Deferred)`||Установка функции предобработки растров объектов слоя.  Единственный аргумент - ф-ция, которая принимает растр объекта (image) и описание этого растра (). Возвращает: `Canvas` - объект замещающий исходный растр, `null` - не показывать растр. Может возвращать `Deferred` при асинхронном режиме.
removeImageProcessingHook|`removeImageProcessingHook()`||Удалить функцию предобработки растров объектов слоя.
addObserver|`addObserver(Observer options)`|`<observer>`|Добавление функции отбора объектов слоя по заданным условиям.
removeObserver|`removeObserver(<observer>)`|`<observer>`|Удаление обсервера.
getItemProperties|`getItemProperties(attribute[])`|`<Object>`|Преобразование массива атрибутов векторного объекта в Hash.
setStyleHook|`setStyleHook(<Func>)`|`this`|Установка функции переопределения стиля отрисовки объекта. Единственный аргумент - ф-ция, которая принимает объект из слоя и возвращает (`null` - объект не отрисовывать , `<Style object>` - переопределямые свойства стиля отрисовки объекта)
removeStyleHook|`removeStyleHook()`||Удаление функции переопределения стиля отрисовки объекта.
setStyles|`setStyles(<`[StyleFilter](#user-content-stylefilter---объект-стиля-слоя)`>[])`|`this`| Установка массива стилей слоя (Примеры: [setStyleProp.html](http://scanex.github.io/Leaflet-GeoMixer/debug/setStyleProp.html), getStyles|`getStyles()`|`<`[StyleFilter](#user-content-stylefilter---объект-стиля-слоя)`>[]`| Получение массива стилей слоя (выдаются опции стилей отличающиеся от устанавливаемых по умолчанию).
getIcons|`getIcons()`|`<`[StyleFilter](#user-content-stylefilter---объект-стиля-слоя)`>[]`| Получение массива объектов иконок для каждого из стилей слоя (при наличии `iconURL` для каждого стиля в ключе `image` выдается `<HTMLCanvasElement || HTMLImageElement>`).
setStyle|`setStyle(<`[StyleFilter](#user-content-stylefilter---объект-стиля-слоя)`>, <UInt>num)`|`this`|Изменение существующего стиля - под номером `num` (при отсутствии стиля команда игнорируется).
setRasterOpacity|`setRasterOpacity(<Float>)`|`this`|Изменение opacity растровых снимков объектов слоя (в дипазоне от `0` до `1`).
setZIndexOffset|`setZIndexOffset(<UInt>)`||Установка `z-index` смещения контейнера слоя(по умолчанию: `0`)

#### Events

| Type | Property | Description
| --- | --- |:---
| click | `<Event>` | click на объекте векторного слоя
| dblclick | `<Event>` | dblclick на объекте векторного слоя
| mousedown | `<Event>` | mousedown на объекте векторного слоя
| mouseup | `<Event>` | mouseup на объекте векторного слоя
| mousemove | `<Event>` | mousemove на объекте векторного слоя
| mouseover | `<Event>` | mouseover на объекте векторного слоя
| mouseout | `<Event>` | mouseout на объекте векторного слоя
| contextmenu | `<Event>` | contextmenu на объекте векторного слоя

## StyleFilter - объект стиля слоя

      // массив стилевых фильтров слоя (по умолчанию: '[стилевой фильтр по умолчанию]')  
        {  
           'MinZoom': <Uint>                 // мин. zoom (по умолчанию: `1`)
           ,'MaxZoom': <Uint>                // макс.zoom (по умолчанию: `21`)
           ,'Filter': <SQL string>           // SQL выражение стиля (по умолчанию: `` без фильтрации)
           ,'Balloon': <String>              // Шаблон балуна (поля атрибутов объектов заключаются в квадратные скобки)
           ,'DisableBalloonOnMouseMove': <Boolean>   // отключение балунов по наведению (по умолчанию: `true`)  
           ,'DisableBalloonOnClick': <Boolean>   // отключение балунов при `click` (по умолчанию: `false`)  
           ,'RenderStyle': <Style object>    // стиль (Тип данных Style)  
           ,'HoverStyle': <Style object>     // hover стиль (Тип данных Style)  
        }

### SQL string - строка отбора объектов

Применяется в фильтрах и стилях.

Допускаются следующие простейшие операции: `=`,  `>`, `<`, `>=`, `<=`, `LIKE`, `IN`, `OR`

Поля атрибутов объектов заключаются в квадратные скобки.
Строковые константы заключаются в одинарные кавычки.

Примеры выражений:

        [sceneid] = 'irk1-e2346192'
        [sceneid] LIKE 'irk1-e23461%'
        [sceneid] = 'irk1-e2346192'
        [ogc_fid] IN (13, 12, 18)
        [ogc_fid] > 12 OR [ogc_fid] < 6

### Style object - объект стиля
    {
        iconUrl: <String>,              // marker.image - URL иконки маркера
        iconAngle : <Float>,            // marker.angle - угол поворота маркера (по умолчанию: 0)
        iconSize: [<UInt>, <UInt>],     // размер иконки - зависит от marker.size
        iconScale: <Float>,             // масштабирование маркера (по умолчанию: 1) - marker.scale
        iconMinScale: <Float>,          // минимальный scale (по умолчанию: 0.01) - marker.minScale
        iconMaxScale: <Float>,          // максимальный scale (по умолчанию: 1000) - marker.maxScale
        iconCircle: <Boolean>,          // Отображение круга (по умолчанию: false) - marker.circle
        iconCenter: <Boolean>,          // marker.center - флаг центрирования маркера (по умолчанию: false)
        iconAnchor: [<UInt>, <UInt>],   // marker.dx, marker.dy - смещение X,Y
        iconColor  : <UInt>,            // marker.color - замена цвета 0xff00ff на color в маркере (по умолчанию: 0xff00ff)

        stroke: <Boolean>,              // признак отрисовки границы объекта - наличие outline
        color:  <UInt|Expression>,      // цвет границы объекта (по умолчанию: 0) - outline.color
        weight: <UInt>,                 // ширина линии границ объекта (по умолчанию: 0) - outline.thickness
        opacity: <Float>,               // opacity линии границ объекта (от 0.0 до 1.0 по умолчанию: 1) - outline.opacity (от 0 до 100)
        dashArray: <String>,            // описание пунктирной линии [dash pattern](https://developer.mozilla.org/en/SVG/Attribute/stroke-dasharray) (по умолчанию: null) - зависит от outline.dashes 

        fillColor: <UInt|Expression>,   // цвет заполнения (по умолчанию: 0) - fill.color
        fillOpacity: <Float>,           // opacity заполнения объекта (от 0.0 до 1.0 по умолчанию: 1) - fill.opacity (от 0 до 100)
        fillIconUrl: <String>,          // URL BitMap которое берется в качестве подложки заполнения (по умолчанию: '') - fill.image 
        fillPattern: {                  // fill.pattern
                colors: <UInt>[]        // массив цветов в формате UInt|Expression (по умолчанию: [])
                style: String,          // могут быть заданны строки (horizontal, vertical, diagonal1, diagonal2, circle, cross)
                                                        (по умолчанию: 'horizontal')
                width: <UInt>,          // ширина каждого цвета в пикселах (по умолчанию: 8)
                step: <UInt>            // отступ в пикселах после каждого цвета (для circle от края)
        },
        fillRadialGradient: {                // fill.radialGradient
                x1: <UInt|Expression>     // сдвиг по оси X центра первой окружности; (по умолчанию: 0)
                y1: <UInt|Expression>     // сдвиг по оси Y центра первой окружности; (по умолчанию: 0)
                r1: <UInt|Expression>     // радиус первой окружности; (по умолчанию: 0)
                x2: <UInt|Expression>     // сдвиг по оси X центра второй окружности; (по умолчанию: 0)
                y2: <UInt|Expression>     // сдвиг по оси Y центра второй окружности; (по умолчанию: 0)
                r2: <UInt|Expression>     // радиус второй окружности; (по умолчанию: 0)
                colorStop: [[position, color, opacity]...]     // массив стоп цветов объекта градиента
                  // position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
                  // color — код цвета или формула.
                  // opacity — прозрачность
                    (по умолчанию: addColorStop = [[0, 0xFF0000,0.5], [1, 0xFFFFFF,1]])
        },
        fillLinearGradient: {              // fill.linearGradient
                x1: <UInt|Expression>     // сдвиг по оси X начальной точки (по умолчанию: 0)
                y1: <UInt|Expression>     // сдвиг по оси Y начальной точки (по умолчанию: 0)
                x2: <UInt|Expression>     // сдвиг по оси X конечной точки (по умолчанию: 0)
                y2: <UInt|Expression>     // сдвиг по оси Y конечной точки (по умолчанию: 0)
                colorStop: [[position, color, opacity]...]     // массив стоп цветов объекта градиента
                  // position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
                  // color — код цвета или формула.
                  // opacity — прозрачность
                    (по умолчанию: addColorStop = [[0, 0xFF0000,100], [1, 0xFFFFFF,100]])
        },

        labelTemplate: <String>,         // Шаблон текста метки, поля заключаются в квадратные скобки (по умолчанию: '')
        labelField: <String>,            // текст метки брать из атрибута объекта (по умолчанию: '') - label.field
        labelColor: <UInt>,              // цвет текстовой метки (по умолчанию: 0) - label.color
        labelHaloColor: <UInt>,          // цвет Glow вокруг метки (по умолчанию: -1) - label.haloColor
        labelFontSize: <UInt>,           // FontSize метки  (по умолчанию: 0) - label.size
        labelSpacing: <UInt>,            // растояние между символами (по умолчанию: 0) - label.spacing
        labelAlign: <String>,            // выравнивание могут быть заданны строки (left, right, center) (по умолчанию: left) - только для точечных объектов
        labelAnchor: [<UInt>, <UInt>],   // смещение label X,Y - зависит от label.dx, label.dy, label.align - только для точечных объектов
    }

**Expression** - строка арифметического выражения результатом которой должно быть число (**Float**)
В выражении допускаются следующие опреации (+ - * /)
В квадратных скобках могут указываться имена атрибутов визуализируемого объекта.

### Порядок применения стилей к геометрии
**Point**

*     Если есть `iconUrl`(и данный image доступен), рисуем иконку, используя стили
*     Иначе если есть radialGradient- рисуем круг заполненный радиальным градиентом
*     Иначе, если оба атрибута в массиве `iconSize` > 0, рисуем квадратик(???) заданного размера используя атрибуты для границ и заполнения объекта.
*     Иначе ничего не рисуем

**Line**

*     Если есть `iconUrl`, рисуем иконку в центре bounds объекта, используя стили
*     Иначе, рисуем линию, используя атрибуты для границ объекта.

**Polygon**

*     Если есть `iconUrl`, рисуем иконку в центре  bounds объекта, используя стили
*     Рисуем границы полигона, используя атрибуты для границ объекта.
*     Примененяем стили заполнения (атрибуты с префиксом `fill`)

**Применение стиля заполнения**

*     Если есть `fillImage` (и данный image доступен) – background полигона заполняется данным image
*     Иначе если есть `fillPattern` – background полигона заполняется сгенерированным по данному pattern bitmap
*     Иначе если есть `fillLinearGradient` - заполняем линейным градиентом
*     Иначе если есть `fillColor` – background полигона заполняется используя fillColor, fillOpacity
*     Иначе заполнения нет

### Observer options
Параметр|Тип|Значение по умолчанию|Описание
------|:--:|:------:|:-----------
type|`<String>`|`update`|Тип обсервера. Возможные значения (`update` - передача изменений, `resend` - передача всех объектов)
bbox|`<Bounds>`|Весь мир| Прямоугольник отслеживания объектов
dateInterval|`<Date[]>`|`null`| Временной интервал. (Для не мультивременных слоев `null`).
filters|`<String[]>`|`[]`| Массив идентификаторов фильтров применяемых в обсервере (на данный момент только `userFilter` предварительно воспользовавшись методом слоя `setFilter`).
callback|`Func(Observer data)`||Производится отбор объектов по заданным условиям: `bbox`, `dateInterval` и `filters`.

### Observer data
Параметр|Тип|Значение по умолчанию|Описание
------|:--:|:------:|:-----------
count|`<UInt>`|`0`|Количество объектов отобранных по условиям отбора объектов указанным в обсервере.
added|`<VectorTile item[]>`|[]|Массив объектов (при `type="update"` только объекты ранее не удовлетворявшие условиям отбора).
removed|`<String[]>`|null|Массив идентификаторов удаляемых объектов т.е. переставших удовлетворять условиям отбора(при `type="resend"` атрибут отсутствует).

### VectorTile item
Объекты векторного слоя получаемые с сервера разбиты по тайлам - части геометрии выходящие за пределы тайлов заменяются отрезками по границам тайла.

Параметр|Тип|Значение по умолчанию|Описание
------|:--:|:------:|:-----------
id|`<UInt>`|`0`|Идентификатор объекта.
properties|`<attribute[]>`|[]|Массив атрибутов (первый элемент - id объекта, последний - геометрия части объекта).
dataOption|`<Object>`|null|Дополнительная информация.
item|`<Object>`|null|Дополнительная информация объекта.

## Класс L.gmx.RasterLayer

Класс `L.gmx.RasterLayer` рисует на карте растровые слои из GeoMixer-а.

Method|Syntax|Return type|Description
------|------|:---------:|-----------
addTo|`addTo(map)`|`this`|Добавить слой на карту. Аргумент `map` имеет тип `L.Map`.

## Класс L.gmx.Map
Класс `L.gmx.Map` используется для работы с картой (как с набором слоёв). Он включает ряд свойств для итерирования и поиска слоёв из карты.

###Свойства

Свойство|Тип|Описание
------|:---------:|-----------
layers|`L.gmx.VectorLayer[]` или `L.gmx.RasterLayer[]`| Массив всех слоёв из карты GeoMixer-а
layersByID|Object| Хеш слоёв с ID слоя в качестве ключа хеша
layersByTitle|Object| Хеш слоёв с заголовком (title) слоя в качестве ключа хеша
