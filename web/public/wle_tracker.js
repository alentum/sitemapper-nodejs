//WebLog Expert Tracker 2.01
(function () {
	function RequestTracker(visible) {
		var imgTracker = new Image(1, 1);
		imgTracker.src = "/wle_tracker.gif?screensize=" +
			screen.width + "x" + screen.height + "&colordepth=" + screen.colorDepth +
			"&lang=" + (navigator.language ? navigator.language.toLowerCase() : navigator.browserLanguage.toLowerCase()) +
			"&fl=" + GetFlashVersion() + "&v=" + (visible ? "1" : "0") + "&r=" + Math.random().toString().slice(2, 10);
	}

	function GetFlashVersion() {
		try {
			if (navigator.plugins && navigator.plugins.length) {
				for (var i = 0; i < navigator.plugins.length; i++)
					if (navigator.plugins[i].name.indexOf("Shockwave Flash") != -1) {
						var arr = navigator.plugins[i].description.split("Shockwave Flash ")[1].replace(" r", ".").replace(" d", ".").replace(/\s/g, "").split(".");
						return arr[0] + "." + arr[1] + "." + arr[2];
					}
			}
			else if (window.ActiveXObject) {
				var flashObj = new ActiveXObject("ShockwaveFlash.ShockwaveFlash");
				if (flashObj) {
					var arr = flashObj.GetVariable("$version").split(" ")[1].split(",");
					return arr[0] + "." + arr[1] + "." + arr[2];
				}
			}
		}
		catch (e) {
		}

		return "0";
	}

	var isPrerendering = false;

	function handleVisibilityChange(evt) {
		if (isPrerendering && (document.webkitVisibilityState != "prerender")) {
			RequestTracker(true);
			isPrerendering = false;
		}
	}

	if (document.webkitVisibilityState != "prerender")
		RequestTracker(true);
	else {
		RequestTracker(false);
		isPrerendering = true;
		document.addEventListener("webkitvisibilitychange", handleVisibilityChange, false);
	}
})();