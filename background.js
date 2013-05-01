
Storage.storage_upgrades();


// Added in version 0.1.4
localStorage['VERSION'] = '0.7.13';

// Id of the root menu when the contextmenu activator is used.
var G_rootMenuId = null;




chrome.extension.onRequest.addListener(function(request, sender, sendResponse){

	if(request.action == 'saveEngine'){


		var engines = Storage.getSearchEngines();
		engines.push(request.engine);

		Storage.setSearchEngines(engines);

		_update_context_menu();
		Sync.saveStorage(Storage);
		sendResponse({});
		return;
	}

	else if(request.action == 'optionsChanged'){

		_update_context_menu();
		Sync.saveStorage(Storage);
		sendResponse({});
		return;
	}

	else if(request.action == 'openUrls'){

		_openAllUrls(request.urls);

		sendResponse({});
		return;
	}


	resp = {}

	resp.options = Storage.getOptions();
	resp.sync_options = Storage.getSyncOptions();

	resp.searchEngines = Storage.getSearchEngines();

	resp.default_style = $('#default-style').text();
	resp.extra_style = Storage.getStyle('');


	sendResponse(resp);

});



function _openAllUrls(urls){

	var opt = Storage.getOptions();

	for(var i=0; i<urls.length; ++i){
		chrome.tabs.create({
			'url' : urls[i],
			'selected' : !opt.background_tab,
		});
	}
}

function _update_context_menu(){
	_remove_context_menu();

	if(Storage.getOptions().context_menu == 'enabled')
		_create_context_menu();

}

function _create_context_menu(){


	var _rootMenu = chrome.contextMenus.create({
		'title' : 'Search',
		'contexts' : ['selection']
	});

	G_rootMenuId = _rootMenu;


	function _getUrl(url, selection){
		// Special case for only "%s" engine
		// to allow opening of selected urls
		var sel = '';
		if(url == '%s'){
			if(!selection.match(/^(https?|ftp):\/\//))
				sel = 'http://' + selection;
			else
				sel = selection;
		}
		else
			sel = encodeURIComponent(selection);

		return url.replace(/%s/g, sel);
	}

	function _getPostUrl(url, selection){
		var parts = url.split('{POSTARGS}', 2);
		if(parts.length == 2){
			url = parts[0].replace(/%s/g, encodeURIComponent(selection));
			url += '{POSTARGS}' + parts[1].replace(/%s/g, selection);
		}else{
			url = url.replace(/%s/g, encodeURIComponent(selecton));
		}
		return chrome.extension.getURL('postsearch.html') + '?url=' + encodeURIComponent(url);
	}

	function _createSearchUrl(en, selection){

		if(en.post)
			return _getPostUrl(en.url, selection);
		else
			return _getUrl(en.url, selection);
	}


	function _addEngine(engine, parent){


		if(engine.is_submenu){

			if(engine.openall && engine.hidemenu){

				chrome.contextMenus.create({
						'title' : engine.name,
						'contexts' : ['selection'],
						'parentId' : parent,

						'onclick' : function (info, tab){

							function get_all_links(en, urls){

								for(var i in en.engines){

									var e = en.engines[i];
									if(_separate_menus && e.hide_in_ctx)
										continue;
									if(e.is_submenu){
										urls = get_all_links(e, urls);
									}else{
										urls.push(_createSearchUrl(e, info.selectionText));
									}
								}
								return urls;
							}

							_openAllUrls(get_all_links(engine, []));
						}
					});

				return;
			}

			var _mid = chrome.contextMenus.create({
				'title' : engine.name,
				'contexts' : ['selection'],
				'parentId' : parent
			});

			if(engine.openall){


				chrome.contextMenus.create({
					'title' : 'Open all',
					'contexts' : ['selection'],
					'parentId' : _mid,

					'onclick' : function (info, tab){

						function get_all_links(en, urls){

							for(var i in en.engines){

								var e = en.engines[i];
								if(_separate_menus && e.hide_in_ctx)
									continue;
								if(e.is_submenu){
									urls = get_all_links(e, urls);
								}else{
									urls.push(_createSearchUrl(e, info.selectionText));
								}
							}
							return urls;
						}

						_openAllUrls(get_all_links(engine, []));
					}
				});
				chrome.contextMenus.create({
					'type' : 'separator',
					'contexts' : ['selection'],
					'parentId' : _mid
				});
			}


			for (i in engine.engines){

				var _en = engine.engines[i];

				if(_separate_menus && _en.hide_in_ctx)
					continue;

				_addEngine(_en, _mid);
			}

			return;
		}

		else if(engine.is_separator){

			var _mid = chrome.contextMenus.create({
				'type' : 'separator',
				'contexts' : ['selection'],
				'parentId' : parent
			});

			return;
		}


		var _mid = chrome.contextMenus.create({
			'title' : engine.name,
			'contexts' : ['selection'],
			'parentId' : parent,

			'onclick' : function (info, tab){

				var _clicked_en = _engine_mapping[info.menuItemId];

				var url = '';

				if(_clicked_en.post){
					url = _getPostUrl(_clicked_en.url, info.selectionText);
				}else
					url = _getUrl(_clicked_en.url, info.selectionText);


				if(_opts.newtab){

					chrome.tabs.create({
						'url' : url,
						'selected' : !_opts.background_tab,
					});

				}else{

					chrome.tabs.getSelected(null, function(tab){
						chrome.tabs.update(tab.id, {
							'url' : url
						});
					});

				}
			}


		});

		_engine_mapping[_mid] = engine;
	}



	var _engine_mapping = {};

	var _engines = Storage.getSearchEngines();

	var _opts = Storage.getOptions();
	var _separate_menus = _opts.separate_menus;


	for (i in _engines){
		var _en = _engines[i];

		if(_separate_menus && _en.hide_in_ctx)
			continue;

		_addEngine(_en, _rootMenu);
	}

	return _rootMenu;
}

function _remove_context_menu(){

	if(G_rootMenuId != null){
		chrome.contextMenus.remove(G_rootMenuId);
		G_rootMenuId = null;
	}
}


if(Storage.getOptions().context_menu == 'enabled')
	_create_context_menu();




chrome.storage.sync.get(null, function(items){

	if(chrome.runtime.lastError !== undefined){

		var notification = webkitNotifications.createNotification(
		  'icon48.png',
		  'Synchronization Error',
		  'Failed to load synced settings ('+chrome.runtime.lastError+')'
		);

		notification.show();
		return;
	}

	Sync.loadStorage(Storage, items);
	_update_context_menu();

});



chrome.storage.onChanged.addListener(function(changes, type){

	if(type != 'sync')
		return;

	Sync.updateStorage(Storage, changes);
	_update_context_menu();

});

