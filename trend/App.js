/*
 * (c) 2013 Rally Software Development Corp.  All Rights Reserved.
 * 
 *  Notes:  
 *       1. This app will first get the items that _currently have the tag__ and then goes to look for
 *       history.  This means that you can add a tag to something today to see its state yesterday.  It
 *       also means that you don't see how designations change over time.
 *       2. However, the measurement field is the value it was on each day sampled -- so if the PlanEstimate,
 *       for example, was changed in March, the April value will reflect the new value, while March keeps
 *       the old one.
 *       
 */
 Ext.define('TagTrendApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    version: 0.2,
    items: [ 
        { xtype:'container', layout:{type:'hbox'}, items: [
            {xtype:'container', itemId:'selector_box', layout: { type:'hbox' }, padding: 5, margin: 5, defaults: { padding: 5 } }, 
            {xtype:'container',itemId:'button_box', margin: 5, padding: 5 }
        ]},
        { xtype:'container', itemId:'chart_box', margin: 5 }
    ],
    launch: function() {
        this._addSelectors();
    },
    _log: function(msg) {
        window.console && console.log(msg);
    },
    _showMask: function(msg) {
        if ( this.getEl() ) { 
            this.getEl().unmask();
            this.getEl().mask(msg);
        }
    },
    _hideMask: function() {
        this.getEl().unmask();
    },
    _artifact_hash: {}, /* key will be object id */
    _addSelectors: function() {
        this._addTagPicker();
        this._addZoomPicker();
        this._addFieldPicker();
        this._addButton();
    },
    _addTagPicker: function() {
        this.down('#selector_box').add({
            itemId: 'tags',
            xtype:'rallycombobox',
            storeConfig: { 
                autoLoad: true,
                typeAhead: true,
                limit: 'Infinity',
                model: 'Tag', 
                sorters: [{property:'Name'}]
            },
            stateEvents: ['select'],
            stateId: 'rally.techservices.techdebt.tag',
            stateful: true,
            fieldLabel: 'Tag:',
            labelWidth: 25,
            listeners: {
                select: function(picker,values){
                    this._log("tags.select");
                    this._enableButton();
                },
                ready: function(picker) {
                    this._log("tags.ready");
                    this._enableButton();
                },
                staterestore: function(picker) {
                    this._log("tags.staterestore");
                    this._enableButton();
                },
                scope: this
            }
        });
    },
    _addZoomPicker: function() {
        var store = Ext.create('Ext.data.Store',{
            fields: ['text','count'],
            data: [
                {text:'Monthly',count:24},
                {text:'Quarterly',count:16},
                {text:'Yearly',count:4}
            ]
        });
        this.down('#selector_box').add({
            itemId: 'zoom',
            xtype:'combobox',
            store: store,
            displayField: 'text',
            valueField: 'count',
            stateEvents: ['select'],
            stateId: 'rally.techservices.techdebt.zoom',
            stateful: true,
            fieldLabel: 'Zoom:',
            labelWidth: 30,
            listeners: {
                change: function(picker) {
                    this._log("zoom.change");
                    this._enableButton();
                },
                staterestore: function(picker) {
                    this._log("zoom.staterestore");
                    this._enableButton();
                },
                scope: this
            }
        });
    },
    _addButton: function() {
        var me = this;
        this.down('#button_box').add({
            itemId: 'go_button',
            xtype: 'rallybutton',
            text: 'Go',
            disabled: true,
            margin: 3,
            handler: function() {
                me._doTaggedStoryQuery();
            }
        }); 
        this._enableButton();
    },
    _enableButton: function() {
        // ALL THREE selectors must be chosen to proceed
        if ( this.down('#go_button') ) {
            if ( ! this.down('#tags') || ! this.down('#zoom') || this.down('#zoom').getValue() === null) {
                return;
            }
            if ( ! this.down('#zoom') || this.down('#zoom').getValue() === null) {
                this._log("No zoom value yet");
                return;
            }
            if ( ! this.down('#measure') || this.down('#measure').getSubmitValue() === null ) {
                this._log("No measure value yet");
                return;
            }
            this.down('#go_button').setDisabled(false);
        }
    },
    _addFieldPicker: function() {
        var me = this;
        Rally.data.ModelFactory.getModel({
            type: 'HierarchicalRequirement',
            success: function(model) {
               var number_field_list = [{ displayName: "Count", name: "Count", _lookback_name: "Count" }];
               var number_field_types = ["INTEGER","QUANTITY","DECIMAL"];
               var fields_to_skip = ["ObjectID","Rank","FormattedID"];
               
               Ext.Array.each( model.getFields(), function(field) {
                  if ( field.attributeDefinition 
                    && Ext.Array.indexOf(number_field_types, field.attributeDefinition.AttributeType) != -1
                        && Ext.Array.indexOf(fields_to_skip, field.name) === -1 ) {
                    me._log(field);
                    field._lookback_name = field.name;
                    if ( field.custom ) {
                        field._lookback_name = "c_"+field.name;
                    }
                    number_field_list.push( field );
                  }
               });
               var store = Ext.create('Rally.data.custom.Store',{
                    fields: ['displayName','name','_lookback_name'],
                    data: number_field_list
                });
                me.down('#selector_box').add({
                    itemId: 'measure',
                    xtype:'rallycombobox',
                    store: store,
                    displayField: 'displayName',
                    valueField: 'name',
                    stateEvents: ['select'],
                    stateId: 'rally.techservices.techdebt.counter_field',
                    stateful: true,
                    fieldLabel: 'Measure:',
                    labelWidth: 45,
                    listeners: {
                        change: function(picker) {
                            me._log("measure.change");
                            me._enableButton();
                        },
                        staterestore: function(picker) {
                            me._log("measure.staterestore");
                            me._enableButton();
                        },
                        show: function(picker) {
                            this._log("measure.show");
                            this._enableButton();
                        }
                    }
                });
            }
        })
    },
    /* 
     * we're not restricted to project scoping because there are some things in a separate debt project to follow.
     * we have to get the items through wsapi first to prevent permissions issue when hitting lookback
     */
    _doTaggedStoryQuery: function() {
        this._log( "------ Begin Finding Items -------" );
        this._artifact_hash = {};
        var tag_name = this.down('#tags').getRecord().get('Name');
        var measure_field = this.down('#measure').getSubmitValue();
        this._log("Measure_field: " + measure_field);
        
        // first, find all the items with the tag.  Use WSAPI so that we don't have
        // a permissions issue later
        this._showMask("Finding Stories with tag " + tag_name);
        var items = [];
        Ext.create('Rally.data.WsapiDataStore',{
            model: 'User Story',
            autoLoad: true,
            limit: Infinity,
            context: { "project": null },
            filters: [{"property":"Tags.Name","operator":"contains","value":tag_name}],
            fetch: ['ObjectID',measure_field,"Release","ReleaseDate","CreationDate"],
            listeners: {
                load: function(store,data,success){
                    items = data;
                    this._doTaggedDefectQuery(tag_name,items);
                },
                scope: this
            }
        });
    },
    _doTaggedDefectQuery: function(tag_name,items){
        this._showMask("Finding Defects with tag " + tag_name);
        var measure_field = this.down('#measure').getSubmitValue();
        
        Ext.create('Rally.data.WsapiDataStore',{
            model: 'Defect',
            autoLoad: true,
            limit: Infinity,
            context: { "project": null },
            filters: [{"property":"Tags.Name","operator":"contains","value":tag_name}],
            fetch: ['ObjectID',measure_field,"Release","ReleaseDate","CreationDate"],
            listeners: {
                load: function(store,data,success){
                    items = Ext.Array.push(items,data);
                    this._setItemHash(items);
                    this._getCumulativeHistory(items);
                },
                scope: this
            }
        });
    },
    _setItemHash: function(items) {
        var me = this;
        this._artifact_hash = {};
        Ext.Array.each( items, function(item) {
            var release = item.get('Release');
            item.set('_ReleaseDate',null);
            if ( release ) {
                item.set('_ReleaseDate', release.ReleaseDate);
            }
            me._artifact_hash[item.get('ObjectID')] = item;
        });
        return;
    },
    _getDateArray: function(unit,count){
       this._log(["_getDateArray",unit,count]);  
       var date_array = [];
       var count_override = 1;
       var today = new Date();

       var unit_name = "minute";
       if ( unit == "Monthly" ) {
        today = new Date(today.getFullYear(),today.getMonth(), 1);
        unit_name = "month";
       }
       if ( unit == "Quarterly" ) {
        // to get the end of a quarter, go the the first day of the next quarter
        // then go back a day (because it's harder to guess whether a month will end on 30 or 31)
        // So the first day of this quarter is :
        var beginning_of_quarter = new Date( today.getFullYear(), Math.floor( today.getMonth() / 3 ) * 3, 1 );
        
        today = beginning_of_quarter;
        unit_name = "month";
        count_override = 3;
       }
       if ( unit == "Yearly" ) {
        today = new Date(today.getFullYear(), 0, 1);
        unit_name = "year";
       }
       
       var multiplier = count * count_override;
       
       var day = Rally.util.DateTime.add(today,unit_name,-1*multiplier);
       while ( day <= today ) {
        var date_to_push = day;
        if ( unit == "Quarterly" ) {
            // Go back a day because we don't have this quarter's info yet:
            date_to_push = Rally.util.DateTime.add(day,"day",-1);
        }
        date_array.push( Rally.util.DateTime.toIsoString(date_to_push) );
        day = Rally.util.DateTime.add(day,unit_name,count_override);
       }
       return date_array;
    },
    _getCumulativeHistory: function(items) {
        this._showMask("Getting Cumulative Historical Data");
        var oid_array = [];
        Ext.Array.each( items, function(item) { oid_array.push(item.get('ObjectID')); } );
        // cycle by time period
        var date_unit = this.down('#zoom').getRawValue();
        var date_count = parseInt( this.down('#zoom').getSubmitValue(), 10 );
        var date_array = this._getDateArray(date_unit,date_count);
        var current_date = date_array.shift();
        // have to break the history query because the query is a GET and the length is limited
        this._doNestedCumulativeHistoryQuery(oid_array,0,current_date,date_array,{});
    },
    /* this does a double nest: cycle until we've used up the array of items to search for on a day, then start
     * over again for another day and so on until the date_array is empty
     */
    _doNestedCumulativeHistoryQuery: function(oid_array,start_index,current_date,date_array,found_items) {
        this._showMask("Getting Cumulative History Data " + current_date);
        this._log(["_doNestedCumulativeHistoryQuery",start_index,current_date]);
        var measure_field = this.down('#measure').getRecord().get('_lookback_name');
       
        var gap = 200;
        var sliced_array = oid_array.slice(start_index, start_index+gap);
        if ( ! found_items[current_date] ) { found_items[current_date] = []; }
        
        var filters = [
            {"property":"ObjectID","operator":"in","value":sliced_array},
            /* {"property":"ScheduleState","operator":">=","value":"Completed"}, */
            {"property":"__At","value":current_date}
        ];
        
        Ext.create('Rally.data.lookback.SnapshotStore',{
            autoLoad: true,
            limit: gap,
            fetch: ['_UnformattedID',measure_field,'ObjectID','ScheduleState'],
            hydrate: ['ScheduleState'],
            filters: filters,
            listeners: {
                load: function(store,data,success){
                    found_items[current_date] = Ext.Array.push(found_items[current_date],data);
                    
                    start_index = start_index + gap;
                    if ( start_index < oid_array.length ) {
                        this._doNestedCumulativeHistoryQuery(oid_array,start_index,current_date,date_array,found_items);
                    } else {
                        if ( date_array.length > 0 ) {
                            current_date = date_array.shift();
                            start_index = 0;
                            this._doNestedCumulativeHistoryQuery(oid_array,start_index,current_date,date_array,found_items);
                        } else {
                            this._processCumulativeItems(found_items);
                        }
                    }
                },
                scope: this
            }
        });
        
    },
    _processCumulativeItems: function(found_items) {
        this._showMask("Processing Cumulative Items");
        this._log(["Processing",found_items]);
        var me = this;
        var today = new Date();

        var values = {};
        var measure_field = this.down('#measure').getRecord().get('_lookback_name');
                
        var processed_data = [];   
        var last_resolved = 0;
        for ( var day in found_items ) {
            if ( found_items.hasOwnProperty(day) ) {
                var items = found_items[day];
                var values = { 
                    "day": day, 
                    "total_resolved": 0,
                    "total_released": 0,
                    "existing_backlog": 0,
                    "added_to_backlog": 0,
                    "delta_resolved": 0,
                    "delta_released": 0
                };
                
                Ext.Array.each( items, function(item){
                    var added_value = 0;
                    if ( measure_field === "Count" ) {
                        added_value = 1;
                    } else {
                        added_value = item.get(measure_field) || 0;
                    }
                    var artifact = me._artifact_hash[item.get('ObjectID')];
                    if ( item.get('ScheduleState') == "Completed" || item.get('ScheduleState') == "Accepted" ) {
                        values.total_resolved += added_value;
                    } else if ( me._wasCreatedDuringTimePeriod(item,day) ) {
                        values.added_to_backlog += added_value;
                    } else {
                        values.existing_backlog += added_value;
                    }
                    var release_date = artifact.get('_ReleaseDate');
                    var start_date_js = me._getStartOfPeriod(day);
                    var start_date = Rally.util.DateTime.toIsoString(start_date_js,false);
                    
                    if ( release_date && release_date <= day && release_date >= start_date ) {
                        values.delta_released += added_value;
                    }
                });
                
                
                // what changed from the preceding timebox
                values.delta_resolved = values.total_resolved - last_resolved;
                if ( values.delta_resolved < 0 ) { values.delta_resolved = 0; }
                last_resolved = values.total_resolved;
               
                processed_data.push(values);
            }
        }
        
        this._makeChart(processed_data);
    },
    _getStartOfPeriod: function(end_date_iso) {
        var end_date_js = Rally.util.DateTime.fromIsoString(end_date_iso);
        var unit = this.down('#zoom').getRawValue();
        var start_date_js = Rally.util.DateTime.add(end_date_js,"year",-1);
        if ( unit == "Monthly" ) {
            start_date_js = Rally.util.DateTime.add(end_date_js,"month",-1);
        } else if ( unit == "Quarterly" ) {
            start_date_js = Rally.util.DateTime.add(end_date_js,"month",-3);
        }
        
        return start_date_js;
    },
    _wasCreatedDuringTimePeriod: function(item,end_date_iso) {
        var item_creation = this._artifact_hash[item.get('ObjectID')].get('CreationDate');   
        var start_date_js = this._getStartOfPeriod(end_date_iso);
        var end_date_js = Rally.util.DateTime.fromIsoString(end_date_iso);

        if ( item_creation > start_date_js && item_creation <= end_date_js ) {
            return true;
        }
        return false;
    },
    _makeChart: function(processed_data) {
        this._log(["_makeChart",processed_data]);
        this._hideMask();
        
        var me = this;
        
        if ( processed_data.length > 0 ) {
            var fields = [];
            for ( var i in processed_data[0] ) {
                if ( processed_data[0].hasOwnProperty(i)  ) {
                    fields.push(i);
                }
            }
            this._log(["Fields",fields]);
            var store = Ext.create('Ext.data.Store',{
                fields: fields,
                data: { rows: processed_data },
                proxy: { 
                    type: 'memory', 
                    reader: { 
                        type: 'json', 
                        root: 'rows' 
                    }
                }
            });
            
            if ( this.chart ) { this.chart.destroy(); }
            this.chart = Ext.create('Rally.ui.chart.Chart',{
                height: 400,
                series: [
                    { type: 'area', dataIndex: 'total_resolved', name: 'Total Resolved', visible: true },
                    { type: 'area', dataIndex: 'added_to_backlog', name: 'New To Backlog', visible: true },
                    { type: 'area', dataIndex: 'existing_backlog', name: 'Existing Backlog', visible: true },
                    { type: 'line', dataIndex: 'delta_released', name: 'Released', visible: true },
                    { type: 'line', dataIndex: 'delta_resolved', name: 'Resolved', visible: true }
                ],
                store: store,
                chartConfig: {
                    chart: { zoomType: 'xy' },
                    title: { text: "Trends" },
                    plotOptions:{ area: { stacking: "normal" } },
                    yAxis: [ 
                        { title: { text: me.down('#measure').getValue() }, min: 0 }
                    ],
                    xAxis: { 
                        categories: me._getCategories(processed_data,'day')
                    }
                }
            });
            this.down('#chart_box').add(this.chart);
        }
    },
    _getCategories: function(hash_array,key) {
        var category_array = [];
        Ext.Array.each(hash_array, function(item){
            category_array.push( item[key].replace(/T.*$/,"") );
        });
        return category_array;
    }
});
