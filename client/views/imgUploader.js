var imgUploaderDirective = 'viaImgUpload';
var INITIAL_UPLOAD_STATE = {
	progress:0,
	isUploading: false,
	downloadUrl:'',
	uploadResult:'none',
	error:''
};

Template.imgUploader.onCreated(function(){
	Slingshot.fileRestrictions(imgUploaderDirective, {				//only allow images to upload
	  allowedFileTypes: ["image/png", "image/jpeg", "image/gif"],
	  maxSize: 10 * 1024 * 1024 									// 10 MB (use null for unlimited).
	});
	var _self = this;
	this.data.parent.uploadImage = function(fileName){
		if(Meteor.userId()){
			var files = _self.stagedFiles;
			if(lodash.isEmpty(files)){
				return Promise.resolve(lodash.map(_self.data.resolutions,function(resolution){
					return {key:resolution.key, url:null};
				}));
			}
			return Promise.all(
				_.map(files,function(file){
					return new Promise(function(resolve,reject){
						if(!file){
							resolve(null);  								//case when user did not upload file
						} else {
							_self.overallUploadStatus.set(1);
							var resolutionName = file.key
							var newFileName = fileName + '_' + resolutionName;
							var metaContext = {s3Folder: _self.data.s3Folder, newFileName:newFileName};
							console.log(metaContext);
							var uploader = new Slingshot.Upload(imgUploaderDirective, metaContext);
							_self.updateUploadData(resolutionName,{
								isUploading:true
							});

							uploader.send(file.file,function(err,downloadUrl){
								if (err) {
									// Log service detailed response.
									console.log(err);
									console.log('Error uploading', uploader.xhr.response);
									_self.updateUploadData(resolutionName,{				//error in upload
										isUploading:false,
										uploadResult:'error',
										error:uploader.xhr.response
									});
									Growler.error(uploader.xhr.response, 'Upload Error');
									resolve({key:resolutionName, url:null});
								} else {
									_self.updateUploadData(resolutionName,{				//success updates icon to checkmark
										isUploading:false,
										uploadResult:'success',
										downloadUrl:downloadUrl
									});
									resolve({key:resolutionName, url:downloadUrl});
								}
							});

							var hideProgress = function(){
								_self.isDragEnter.set(false);
								Meteor.setTimeout(function(){
									_self.updateUploadData(resolutionName,{
										progress:0
									});
								},200);
							};

							var checkProgress = Meteor.setInterval(function(){
								var updatedProgress = Math.round(uploader.progress()* 100);
								var prevProgress = _self.getUploadData(resolutionName).progress;
								if(updatedProgress !== prevProgress){
									_self.updateUploadData(resolutionName,{
										progress:updatedProgress
									});
								}
								if(updatedProgress === 100){
									Meteor.clearInterval(checkProgress);
									Meteor.clearTimeout(cancelCheckProgress);
									hideProgress();
								}
							},16);

							var cancelCheckProgress = Meteor.setTimeout(function(){
								Meteor.clearInterval(checkProgress);
								_self.updateUploadData(resolutionName,{
									isUploading:false,
									uploadResult:'error',
									error:'timeout after 10s, client cancelled upload'
								});
							},10000);
						}
					});
				}.bind(this))
			);

		} else {
			return Promise.reject('you are not authorized');
		}
	};

/*				reject('you need a login to continue');
				// _self.isDragEnter.set(false);
				// toastr.error('please login to perform this transaction','TRANSACTION DENIED');

		});
	}*/

	this.resetUploader = function(){
		_self.clearUploadData();
		_self.overallUploadStatus.set(0);
		_self.base64Url.set('');
		_self.stagedFiles = [];
		_self.find('#hidden-file-input').value = '';
		Session.set('newFileExt','');
		Session.set('displayExistingImg',false);
	}

	this.data.parent.resetUploader = this.resetUploader;

	this.data.parent.imgUploaderisDirty = function(){
		return this.imgDirty.get();
	}.bind(this);

	this.data.parent.injectS3Data = function(images){
		var _this = this;
		lodash.each(images,function(data,k){
			Tracker.nonreactive(function(){
				_this.updateUploadData(k,{
					uploadResult:'success',
					downloadUrl:data.url
				});
			});
		});

	}.bind(this);

	this.clearUploadData = function(){
		this.uploadData.set(this.getInitialResolutions());
	};

	//INITIALIZE REACTIVE VARIABLES
	this.isDragEnter = new ReactiveVar(false);
	this.base64Url = new ReactiveVar('');
	this.progress = new ReactiveVar(0);
	this.overallUploadStatus = new ReactiveVar(0);
	this.imgDirty = new ReactiveVar(false);
	this.stagedFiles = [];

	this.getInitialResolutions = function(){
		return lodash.map(this.data.resolutions,function(resolution){
			return lodash.assign(resolution, INITIAL_UPLOAD_STATE);
		});
	}

	this.uploadData = new ReactiveVar(this.getInitialResolutions());

	this.updateUploadData = function(key,newData){
		var newUploadData = lodash.map(this.uploadData.get(), function(data){
			if(data.key === key){
				return lodash.assign(data,newData);
			}
			return data;
		});
		this.uploadData.set(newUploadData);
	};

	this.getUploadData = function(key){
		return lodash.find(this.uploadData.get(),function(resolution){
			return resolution.key === key;
		});
	};

	this.autorun(function(){
		if(this.data.parent.getAssetInfo()._id){
			Session.set('displayExistingImg',true);
		} else {
			Session.set('displayExistingImg',false);
		}
		this.imgDirty.set(false);
	}.bind(this));
	
});

Template.imgUploader.onRendered(function(){

})

Template.imgUploader.helpers({
	isDragEnter:function(){
		return Template.instance().isDragEnter.get() ? 'dragenter' : '';
	},
	
	displayDefaultMsg:function(){
		return Template.instance().overallUploadStatus.get()>0 ? "hidden" : "";
	},
	hasImagePreview:function(){
		var parentInfo = this.parent.getAssetInfo();
		var editId = parentInfo._id;
		var hasImgUrl;
		if(editId){
			hasImgUrl = parentInfo.images && parentInfo.images.standard_resolution.url && !Template.instance().imgDirty.get();
		}
		if (Template.instance().base64Url.get() || hasImgUrl){
			return 'selection-made'
		}
		return '';
	},
	getImagePreview:function(){
		var editId = this.parent.getAssetInfo()._id;
		var localPrev = Template.instance().base64Url.get();
		var existPrev = editId && this.parent.getAssetInfo().images && this.parent.getAssetInfo().images.standard_resolution.url;
		console.log('IMGDIRTY', Template.instance().imgDirty.get());
		if(editId && !Template.instance().imgDirty.get()){
			return existPrev;
		}
		return localPrev;
	},
	getUploadDatas:function(){
		return Template.instance().uploadData.get();
	}
})

Template.imgUploader.events({
	'click .flavor-upload-preview-holder':function(e){		//remove file preview
		preventAndStop(e);
		Template.instance().resetUploader();
		if(this.parent.getAssetInfo()._id){
			Template.instance().data.parent.isDirty.set(true);
			Template.instance().imgDirty.set(true);
		}
	},
	'click #addFlavorPhotoDropzone':function(e){
		preventAndStop(e);
		Template.instance().$('#hidden-file-input').click();
	},
	'click #hidden-file-input':function(e){
		e.stopPropagation();
	},
	'change #hidden-file-input':function(e){
		var _self = Template.instance();
		processDrop(e,_self);
	},
	'dragenter #addFlavorPhotoDropzone':function(e){
		preventAndStop(e);
		Template.instance().isDragEnter.set(true);
	},
	'dragover #addFlavorPhotoDropzone':function(e){
		preventAndStop(e);
	},
	'dragleave #addFlavorPhotoDropzone':function(){
		Template.instance().isDragEnter.set(false);
	},
	'drop #addFlavorPhotoDropzone':function(e){
		preventAndStop(e);
		Template.instance().isDragEnter.set(false);
		var _self = Template.instance();
		processDrop(e,_self);
	}
});

function processDrop(e,context){
	var files = e.currentTarget.files || e.originalEvent.dataTransfer.files;
	if(files.length === 1){
		var file = files[0];
		var fileReader = new FileReader();
		fileReader.onload = function(){
			processFileExt(file.name);
			resizeImages(file,context).then(function(){
				console.log('field is dirty');
				context.imgDirty.set(true);
				context.base64Url.set(fileReader.result);
				context.data.parent.isDirty.set(true);
			});
		}
		fileReader.readAsDataURL(file);
	} else if(files.length > 1) {
		Growler.error("only one file allowed",'Sorry');
	} else {
		Growler.error('no files supplied','Sorry');
	}
}

function processFileExt(filename){
	var ext = filename.split('.').pop();
	Session.set('newFileExt',ext);
}

function resizeImages(file,context){
	context.stagedFiles = [];	//init and clear previous junk
	return Promise.all(
		_.map(context.data.resolutions,function(resolution){
			return new Promise(function(resolve,reject){
				Resizer.resize(file, {
		        width: resolution.size,	// maximum width
		        height: 800, 			// maximum height
		        cropSquare: resolution.square || false
		    }, function(err, newFile) {
		        if(!err){
		        	console.log(resolution.key, 'COMPLETE');
		        	context.stagedFiles.push({
		        		key:resolution.key,
		        		file:newFile
		        	});
		        	resolve();
		        } else {
		        	reject(err);
		        }
		    });
			})
		})
	);
}

function preventAndStop(e){
	e.preventDefault();
	e.stopPropagation();
}