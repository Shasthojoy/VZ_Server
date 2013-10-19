var config  = require('./config/app');
var weibo   = require('./cloud/weibo');

var Post = AV.Object.extend("Post");
var postQuery=new AV.Query('Post').descending('objectId');


function query (req,res,opt) {
    var q;
    if (opt<0) {
        q=postQuery.lessThan('objectId',req.params.id);
    }else if (opt>0){
        q=postQuery.greaterThan('objectId',req.params.id);
    }else{
        q=postQuery;
    }
    

    if (req.query.count) {
        q=q.limit(req.query.count)
    }

    if (req.query.photo=='1') {
        q=q.exists('pics');
    };

    q.find({
      success: function(object) {
        res.json(object);
      },

      error: function(object, error) {
        res.json(error);
      }
    });
}

exports.post={
    before:function (req,res) {
        query(req,res,-1);
    },

    after:function (req,res) {
        query(req,res,1);
    },

    after:function (req,res) {
        query(req,res,0);
    },

    get:function (req,res) {
        postQuery.get(req.params.id, {
          success: function(object) {
            console.log(object['time']);
            res.json(object);
          },

          error: function(object, error) {
            console.log(postQuery._where);
            res.json(error);
          }
        });
    },
    comment:function (req,res) {
        res.send('post comment to id:'+req.params.id);
    },
    add:function (req,res) {
        res.send('add post');
    },
}


//通过频道刷新微博数据
function refresh (req,res,channel_name) {
    var accs=config.channel_account[channel_name];
    if (accs) {
        var ret='refresh channel: '+channel_name;
        var index=Math.ceil(Math.random()*100)%accs.length;
        var acc=accs[index];

        ret+='<br/>will refresh account: '+acc;
        ret+='<br/>==========================';


        weibo.fetchPosts(acc,0,function (posts,dels) {
            ret+='<br/>get posts:'+JSON.stringify(posts);
            ret+='<br/>will del :'+dels;
            ret+='<br/>==========================';
            if(res)res.send(ret);

            var last_wbid='0';

            for (var i = 0; i < posts.length; i++) {
                var post=posts[i];

                if(config.block_account.indexOf(post.user.id)>-1){
                    console.info('ignore user: '+ post.user.id);
                    continue;
                }                

                if (post.wbid > last_wbid) {
                    last_wbid=post.wbid;
                };

                if (accs.indexOf(post.user.id)>-1) {
                    // 自己转自己的... 一般都是广告
                    console.info('ignore: '+post.text);
                    continue;
                };

                var postObj = new Post();
                
                post['channel']=channel_name;
                postObj.save(post,{
                    success: function(p) {
                        console.log('success: '+p.id);
                    },
                    error: function(p, error) {
                      if (error.code!=137) {
                        console.error(error);
                      }
                    }
                });
            };

            //TODO: 从数据库中标记为已交易 (Travis 13-10-13 16:44)
            for (var i = 0; i < dels.length; i++) {
                var q=new AV.Query('Post').equalTo('wbid',dels[i]);
                q.first({
                    success: function(p) {
                        
                        if (p!=undefined && p._serverData.type!=2) {
                            console.log(p._serverData.text);
                            console.log('should del:'+p._serverData.wbid+" type:"+p._serverData.type);
                            //console.log(p.toJSON());
                            // p.set('type',2,{
                            //     success:function  (argument) {
                            //         console.log('update del:'+argument);
                            //     },
                            //     error: function(p, error) {
                            //       console.log('update error:'+error);
                            //     }
                            // });
                            p.save({type:2},{
                                success:function  (argument) {
                                    console.log('update del:'+argument.toJSON());
                                },
                                error: function(p, error) {
                                  console.log('update error:'+error);
                                }
                            });
                        };
                        
                    },
                    error: function(p, error) {
                      console.error(error);
                    }
                });
            }

            //TODO: save last req id
            console.info('channel:'+channel_name+' > account:'+acc+' last_wbid:'+last_wbid);

            
        });
        
    }else{
        res.send('no channel: '+req.params.channel);
    }
}

exports.refresh={
    channel:function (req,res) {
        var channel_name=req.params.channel;
        refresh(req,res,channel_name);
    },
    all:function (req,res) {
        for (var k in config.channel_account) {
            refresh(req,res,k);
        }
    }
}