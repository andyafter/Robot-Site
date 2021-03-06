angular.module('bolt.user', [
    'bolt',
    'ui.router',
    'ngResource',
    'restmod',
    'ngMaterial',
])

.config(function config($stateProvider, $urlRouterProvider) {

    // go to profile as default
    //$urlRouterProvider.when('/user', '/user/profile');
    $stateProvider
        .state('user', {
            url: '/user',
            views: {
                'main': {
                    templateUrl: 'user/user.tpl.html',
                    controller: '',
                },
            },
            data: {
                pageTitle: 'User'
            }
        })
        .state('user.list', {
            url: '/list',
            views: {
                'user': {
                    templateUrl: 'user/list.tpl.html',
                    controller: 'UserController',
                },
            }
        })
        .state('user.memberlist', {
            url: '/memberlist',
            views: {
                'user': {
                    templateUrl: 'user/memberlist.tpl.html',
                    controller: 'UserController',
                },
            }
        })
        .state('user.settings', {
            url: '/settings',
            views: {
                'user': {
                    templateUrl: 'user/settings.tpl.html',
                    controller: 'UserController',
                },
            }
        })
        .state('user.reviews', {
            url: '/reviews',
            views: {
                'user': {
                    templateUrl: 'user/reviews.tpl.html',
                    controller: 'UserController',
                },
            }
        })
        .state('user.notifications', {
            url: '/notifications',
            views: {
                'user': {
                    templateUrl: 'user/notifications.tpl.html',
                    controller: 'NotificationController',
                },
            },
            params: {
                notifications: {}
            }
        })
        .state('user.profile', {
            url: '/:id',
            views: {
                'user': {
                    templateUrl: 'user/profile.tpl.html',
                    controller: 'UserController',
                },
            },
            params: {
                user: null,
                id: null
            }
        });
})

.controller('UserController', function UserController($scope, $location,
    $http, $log, $state, $stateParams, GlobalService, Social, AuthUser, $mdDialog,
    Enum, User, Portfolio, Mixin, Utils, Message) {

    angular.extend($scope, Mixin.RestErrorMixin);

    // sets the service GlobalServive object to an object in the $scope
    // so it is accessible by the view.
    $scope.globals = GlobalService;

    // initializes the user, userProfile, and error objects

    $scope.errors = {};
    $scope.userProfile = {};
    $scope.userProfilePicture = {};
    $scope.userArticles = [];
    $scope.users = {};
    $scope.twitterCount = 0;
    $scope.facebookCount = 0;
    $scope.scroll = {busy:false};

    // wrapping all user inputs inside an object since children/grandchildren
    // scopes sometimes dont inherit properties (?)
    $scope.userInputs = {};
    $scope.Enum = Enum;

    $scope.observeRestErrorEvents(User);
    //$scope.observeRestErrorEvents(ImportedArticle);
    $scope.rating = {
        current:5,
        max : 3};

    // watches for large images, and create a toast alert
    $scope.$watch('userProfilePicture', function() {
        if ($scope.userProfilePicture && $scope.userProfilePicture.$error) {
            Message.showToast('File too large ' + Math.round($scope.userProfilePicture.size / 100000) / 10 +
                ' MB: max ' + $scope.userProfilePicture.$errorParam + '', 'error', $scope);
        }
    });

    $scope.enableEdit = function() {
        $scope.editMode = true;
        $scope.saveSuccessMsg = null;
        $scope.userProfileBackup = Utils.copyModelInfo($scope.userProfile);
    };

    $scope.cancelEdit = function() {
        Utils.restoreModelInfo($scope.userProfile, $scope.userProfileBackup);
        $scope.userProfileBackup = null;
        $scope.editMode = false;
    };

    $scope.loadUserProfile = function(user, userId) {
        if (!(user instanceof User)) {
            if (userId == $scope.currentUser.id){
                user = $scope.currentUser.$refresh();
            }
            else{
                user = User.$find(userId);
            }
        }
        else
          user.$refresh();
        $scope.userProfile = user;
        $scope.userProfilePicture = null;
    };


    $scope.backToUserList = function() {
        $state.go('user.list');
    };

    $scope.setUserPicture = function(pic) {
        if ($scope.userProfilePicture && !$scope.userProfilePicture.$error) {
            $scope.userProfile.$setProfilePicture($scope.userProfilePicture)
                .$then(function() {
                    console.log($scope.userProfilePicture);
                    $scope.userProfilePicture = null;
                });
        }
    };

    $scope.loadUsers = function() {
        $scope.users = User.$collection().$refresh();
    };

    $scope.saveUser = function() {
        $scope.userProfile.$save().$then(function() {
            $scope.editMode = false;
            $scope.userProfileBackup = null;
            Message.showToast('Your profile information was saved successfully', 'success');
        });
    };

    $scope.importUserArticle = function() {
        var articleUrl = Utils.encodeURL($scope.userInputs.articleUrl);
        if (articleUrl) {
            var article = $scope.userArticles.$build({url: articleUrl});
            article.$moveTo(0).$save().$then(function() {
                Social.twitter(article.url).then(function(ret){
                    if (ret.hasOwnProperty('count') && ret.count) {
                        article.twitterCount = ret.count;
                        $scope.twitterCount += ret.count;
                    }
                });
                Social.facebook(article.url).then(function(ret){
                    if (ret.hasOwnProperty('shares') && ret.shares) {
                        article.facebookCount = ret.shares;
                        $scope.facebookCount += ret.shares;
                    }
                });
                $scope.userProfile.$refresh();

                $scope.userInputs.articleUrl = null;
                $scope.editUserArticle(null, article);
            });
        }
    };

    $scope.cancel = function() {
        $mdDialog.cancel();
    };

    $scope.viewUser = function(user) {
        $state.go('user.profile', {
            user:user, id: user.id
        });
    };

    // This determines which functions to run
    switch ($state.current.name) {
        case 'user.list':
            $scope.loadUsers();
            break;
        case 'user.memberlist':
            $scope.loadUsers();
            break;
        case 'user.profile':
            $scope.loadUserProfile($stateParams.user, $stateParams.id);
            break;
    }
}) // end of UserController

.controller('NotificationController', function NotificationController($scope, $location,
    $http, $interval, $log, $state, $stateParams, GlobalService, Social, AuthUser, $mdDialog,
    Enum, User, Portfolio, Mixin, Utils, Message) {

    $scope.notifications = [];
    $scope.unread_count = 0;
    $scope.latestNotification = null;

    var reloadNotificationInterval = null;

    $scope.notificationList = function(notifications) {
        if (notifications) {
            $scope.notifications = notifications;
        } else {
            $scope.notifications = $scope.currentUser.notifications.$refresh();
        }
    };

    $scope.loadNotifications = function() {
        $scope.notifications = $scope.currentUser.notifications.$refresh();

        $scope.notifications.$on('after-fetch-many', function() {
            $scope.unread_count = Math.max($scope.notifications.$unreadCount(), $scope.unread_count);
        });

        reloadNotificationInterval = $interval(function() {
            $scope.reloadNotifications();
        }, 5 * 1000);

        $scope.$on('$destroy', function() {
          if (reloadNotificationInterval)
              $interval.cancel(reloadNotificationInterval);
        });
    };

    $scope.reloadNotifications = function() {
        $scope.notifications.$fetchNewNotifications();
    };

    $scope.markAllNotificationsAsRead = function() {
        $scope.unread_count = 0;
        $scope.notifications.$markAllAsRead();
    };

    $scope.viewNotification = function(notification) {
        console.log(notification.verb)
        if (notification.verb == Enum.NotificationVerb.JOB_POSTED.label) {
            $state.go('jobs.detail', {id:notification.actionObject, job:null});
        }
        else if (notification.verb == Enum.NotificationVerb.APPLICATION_APPLIED.label) {
            console.log(notification);
            $state.go('applications.list', {id: notification.actionObject, job: null});
            // originally notification.target.id
        }
        else if ($.inArray(notification.verb,
                           [
                               Enum.NotificationVerb.APPLICATION_REJECTED.label,
                               Enum.NotificationVerb.APPLICATION_ACCEPTED.label
                           ]
            ) != -1) {
            $state.go('jobs.detail', {id: notification.target.id, job: null});
        }
        else if ($.inArray(notification.verb,
                         [
                             Enum.NotificationVerb.TASK_COMPLETED.label,
                             Enum.NotificationVerb.TASK_RETURNED.label,
                             Enum.NotificationVerb.TASK_ASSIGNED.label
                         ]
               ) != -1) {
          $state.go('assignments.edit', {id: notification.actionObject.taskBrief.id});
      }

    };
    $scope.viewAllNotifications = function(n){
        $state.go('user.notifications', {notifications: n});
    };

    switch ($state.current.name) {
        case 'user.notifications':
            $scope.loadNotifications($stateParams.notifications);
            break;

        default:
            $scope.loadNotifications();
            break;
    }
}); // end of NotificationController
