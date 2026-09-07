using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SABZ.Application.Interfaces;
using SABZ.Domain.Entities;

namespace SABZ.Infrastructure.Persistence;

/// <summary>
/// Comprehensive QA test-data seeder. Creates a rich dataset for end-to-end
/// testing: a known login account, diverse farms, multiple crops at varied
/// growth stages, monitoring checks with risk levels, community posts with
/// likes/comments, financial transactions, and notifications.
///
/// Fully idempotent — every entity uses a fixed GUID so re-running on an
/// already-seeded database is a no-op. Failures are logged and swallowed;
/// seeding must never block startup.
/// </summary>
public static class QaSeedDataSeeder
{
    // ── Fixed identities ──────────────────────────────────────────────
    // Primary QA account — password: Password123!
    private static readonly Guid QaUser = new("aa000001-0001-4000-8000-000000000001");
    // Secondary QA account for messaging / community testing
    private static readonly Guid QaUser2 = new("aa000002-0002-4000-8000-000000000002");
    // Additional mock community users
    private static readonly Guid MockUser1 = new("aa000003-0003-4000-8000-000000000003");
    private static readonly Guid MockUser2 = new("aa000004-0004-4000-8000-000000000004");
    private static readonly Guid MockUser3 = new("aa000005-0005-4000-8000-000000000005");

    public static async Task SeedAsync(SabzDbContext db, IServiceProvider services, ILogger logger)
    {
        try
        {
            var passwordService = services.GetRequiredService<IPasswordService>();
            var monitoring = services.GetRequiredService<IMonitoringService>();

            // 1. Users
            var userCount = await SeedUsersAsync(db, passwordService);
            // 2. Farms
            var (farmCount, farmIds) = await SeedFarmsAsync(db);
            // 3. Crops
            var cropCount = await SeedCropsAsync(db, farmIds);
            // 4. Monitoring checks (via real service)
            var checkCount = await RegenerateMonitoringAsync(db, monitoring);
            // 5. Community posts + comments + likes
            var (posts, comments, likes) = await SeedCommunityAsync(db);
            // 6. Financial transactions
            var txCount = await SeedFinancialsAsync(db, farmIds);
            // 7. Notifications
            var notifCount = await SeedNotificationsAsync(db);

            logger.LogInformation(
                "QA seed: {Users} users, {Farms} farms, {Crops} crops, {Checks} monitoring checks, " +
                "{Posts} posts, {Comments} comments, {Likes} likes, {Tx} transactions, {Notifs} notifications.",
                userCount, farmCount, cropCount, checkCount, posts, comments, likes, txCount, notifCount);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "QA seed failed; application continues normally.");
        }
    }

    // ── 1. Users ──────────────────────────────────────────────────────
    private static async Task<int> SeedUsersAsync(SabzDbContext db, IPasswordService passwordService)
    {
        var existing = await db.Users.Select(u => u.Id).ToListAsync();
        var created = 0;

        var users = new (Guid Id, string Name, string Email, string? Phone, string Lang)[]
        {
            (QaUser,   "Demo Farmer",       "tester@sabz.com",      "03001234567", "English"),
            (QaUser2,  "Test Bilal",        "bilal@sabz.com",       "03009876543", "Urdu"),
            (MockUser1, "Fatima Khan",      "fatima@demo.sabz.pk",  null,          "English"),
            (MockUser2, "Ali Hassan",       "ali@demo.sabz.pk",     null,          "Urdu"),
            (MockUser3, "Amina Shah",       "amina@demo.sabz.pk",   null,          "English"),
        };

        foreach (var (id, name, email, phone, lang) in users)
        {
            if (existing.Contains(id)) continue;

            // Check email uniqueness
            if (email != null && await db.Users.AnyAsync(u => u.Email == email)) continue;

            var tempUser = new User { FullName = name, PasswordHash = string.Empty };
            db.Users.Add(new User
            {
                Id = id,
                FullName = name,
                Email = email,
                PhoneNumber = phone,
                PasswordHash = passwordService.HashPassword(tempUser, "Password123!"),
                PreferredLanguage = lang,
                Role = "Farmer",
                CreatedAt = DateTime.UtcNow.AddDays(-60)
            });
            created++;
        }

        if (created > 0) await db.SaveChangesAsync();
        return created;
    }

    // ── 2. Farms ──────────────────────────────────────────────────────
    private static async Task<(int count, Dictionary<string, Guid> ids)> SeedFarmsAsync(SabzDbContext db)
    {
        var existing = await db.Farms.Select(f => f.Id).ToListAsync();
        var created = 0;
        var ids = new Dictionary<string, Guid>();

        // Look up locations by name
        var punjab = await db.Provinces.FirstOrDefaultAsync(p => p.Name == "Punjab");
        var sindh = await db.Provinces.FirstOrDefaultAsync(p => p.Name == "Sindh");
        var kp = await db.Provinces.FirstOrDefaultAsync(p => p.Name == "Khyber Pakhtunkhwa");

        if (punjab == null || sindh == null || kp == null) return (0, ids);

        var farmDefs = new (string Key, Guid Id, string Name, int ProvinceId, string District, string Tehsil, decimal Size, string Soil, string Irrigation)[]
        {
            ("chakwal",   new Guid("aa100001-0001-4000-8000-000000000001"), "Chakwal Wheat Farm",       punjab.Id, "Chakwal",              "Chakwal",           12, "Loam",       "Rain-fed"),
            ("multan",    new Guid("aa100002-0002-4000-8000-000000000001"), "Multan Cotton Fields",     punjab.Id, "Multan",               "Multan City",        25, "Sandy",      "Tube-well"),
            ("sahiwal",   new Guid("aa100003-0003-4000-8000-000000000001"), "Sahiwal Rice Paddy",       punjab.Id, "Sahiwal",              "Sahiwal",           18, "Clay",       "Canal"),
            ("ryk",       new Guid("aa100004-0004-4000-8000-000000000001"), "Rahim Yar Khan Sugarcane", punjab.Id, "Rahim Yar Khan",       "Rahim Yar Khan",    50, "Loam",       "Canal"),
            ("swat",      new Guid("aa100005-0005-4000-8000-000000000001"), "Swat Maize & Vegetable",   kp.Id,     "Swat",                 "Mingora",             8, "Sandy",      "Rain-fed"),
        };

        foreach (var (key, farmId, name, provId, distName, tehsilName, size, soil, irr) in farmDefs)
        {
            if (existing.Contains(farmId)) { ids[key] = farmId; continue; }

            var district = await db.Districts.FirstOrDefaultAsync(d => d.Name == distName && d.ProvinceId == provId);
            if (district == null) continue;

            var tehsil = await db.Tehsils.FirstOrDefaultAsync(t => t.Name == tehsilName && t.DistrictId == district.Id);
            if (tehsil == null) continue;

            db.Farms.Add(new Farm
            {
                Id = farmId,
                UserId = QaUser,
                FarmName = name,
                ProvinceId = provId,
                DistrictId = district.Id,
                TehsilId = tehsil.Id,
                FarmSize = size,
                FarmSizeUnit = "Acres",
                SoilType = soil,
                IrrigationType = irr,
                CreatedAt = DateTime.UtcNow.AddDays(-90)
            });
            ids[key] = farmId;
            created++;
        }

        if (created > 0) await db.SaveChangesAsync();
        return (created, ids);
    }

    // ── 3. Crops ──────────────────────────────────────────────────────
    private static async Task<int> SeedCropsAsync(SabzDbContext db, Dictionary<string, Guid> farmIds)
    {
        if (farmIds.Count == 0) return 0;

        var existing = await db.Crops.Select(c => c.Id).ToListAsync();
        var catalog = await db.CropCatalog.AsNoTracking().ToDictionaryAsync(c => c.Name, c => c.Id);
        var created = 0;
        var now = DateTime.UtcNow;

        var cropDefs = new (Guid Id, string FarmKey, string Name, int? CatalogId, string Season, DateTime? Planting, DateTime? Harvest, string Stage, string Status)[]
        {
            // Chakwal — Wheat (Rabi, planted Nov, harvest Mar)
            (new Guid("aa200001-0001-4000-8000-000000000001"), "chakwal", "Wheat",     catalog.GetValueOrDefault("Wheat"),     "Rabi", now.AddDays(-120), now.AddDays(30),  "Maturity",       "Active"),
            (new Guid("aa200002-0001-4000-8000-000000000001"), "chakwal", "Gram (Chickpea)", catalog.GetValueOrDefault("Gram (Chickpea)"), "Rabi", now.AddDays(-100), now.AddDays(10),  "Flowering",      "Active"),

            // Multan — Cotton (Kharif) + Chili
            (new Guid("aa200003-0001-4000-8000-000000000001"), "multan",  "Cotton",    catalog.GetValueOrDefault("Cotton"),    "Kharif", now.AddDays(-45),  now.AddDays(115), "Vegetation",     "Active"),
            (new Guid("aa200004-0001-4000-8000-000000000001"), "multan",  "Chili Pepper", catalog.GetValueOrDefault("Chili Pepper"), "Kharif", now.AddDays(-30), now.AddDays(90),  "Early Growth",   "Active"),

            // Sahiwal — Rice (Kharif) + Maize
            (new Guid("aa200005-0001-4000-8000-000000000001"), "sahiwal", "Rice",      catalog.GetValueOrDefault("Rice"),      "Kharif", now.AddDays(-60),  now.AddDays(70),  "Flowering",      "Active"),
            (new Guid("aa200006-0001-4000-8000-000000000001"), "sahiwal", "Maize",     catalog.GetValueOrDefault("Maize"),     "Kharif", now.AddDays(-25),  now.AddDays(85),  "Early Growth",   "Active"),

            // RYK — Sugarcane + Cotton (past crop)
            (new Guid("aa200007-0001-4000-8000-000000000001"), "ryk",     "Sugarcane", catalog.GetValueOrDefault("Sugarcane"), "Kharif", now.AddDays(-200), now.AddDays(130), "Vegetation",     "Active"),
            (new Guid("aa200008-0001-4000-8000-000000000001"), "ryk",     "Cotton",    catalog.GetValueOrDefault("Cotton"),    "Kharif", now.AddDays(-180), now.AddDays(-20), "Maturity",       "Completed"),

            // Swat — Maize + Potato + Tomato
            (new Guid("aa200009-0001-4000-8000-000000000001"), "swat",    "Maize",     catalog.GetValueOrDefault("Maize"),     "Kharif", now.AddDays(-35),  now.AddDays(75),  "Vegetation",     "Active"),
            (new Guid("aa200010-0001-4000-8000-000000000001"), "swat",    "Potato",    catalog.GetValueOrDefault("Potato"),    "Rabi",   now.AddDays(-50),  now.AddDays(40),  "Flowering",      "Active"),
            (new Guid("aa200011-0001-4000-8000-000000000001"), "swat",    "Tomato",    catalog.GetValueOrDefault("Tomato"),    "Kharif", now.AddDays(-20),  now.AddDays(70),  "Sowing",         "Active"),
        };

        foreach (var (cropId, farmKey, name, catId, season, planting, harvest, stage, status) in cropDefs)
        {
            if (existing.Contains(cropId)) continue;
            if (!farmIds.TryGetValue(farmKey, out var farmId)) continue;

            db.Crops.Add(new Crop
            {
                Id = cropId,
                FarmId = farmId,
                CropName = name,
                CropCatalogId = catId,
                Season = season,
                PlantingDate = planting,
                HarvestDate = harvest,
                GrowthStage = stage,
                Status = status,
                CreatedAt = planting ?? now.AddDays(-60)
            });
            created++;
        }

        if (created > 0) await db.SaveChangesAsync();
        return created;
    }

    // ── 4. Monitoring checks via real service ─────────────────────────
    private static async Task<int> RegenerateMonitoringAsync(SabzDbContext db, IMonitoringService monitoring)
    {
        var crops = await db.Crops.AsNoTracking()
            .Where(c => c.PlantingDate != null && c.CropCatalogId != null && c.Status == "Active")
            .Select(c => new { c.Id, UserId = c.Farm.UserId })
            .ToListAsync();

        var checksCreated = 0;
        foreach (var crop in crops)
        {
            var result = await monitoring.EnsureChecksForCropAsync(crop.UserId, crop.Id);
            checksCreated += result.ChecksCreated;
        }

        // Generate due notifications
        var userIds = crops.Select(c => c.UserId).Distinct();
        foreach (var userId in userIds)
            await monitoring.GetDueChecksAsync(userId);

        return checksCreated;
    }

    // ── 5. Community posts + comments + likes ─────────────────────────
    private static async Task<(int posts, int comments, int likes)> SeedCommunityAsync(SabzDbContext db)
    {
        var existingPostIds = await db.CommunityPosts.Select(p => p.Id).ToListAsync();
        var existingCommentIds = await db.CommunityComments.Select(c => c.Id).ToListAsync();
        var existingLikeKeys = await db.CommunityPostLikes.Select(l => new { l.PostId, l.UserId }).ToListAsync();
        var likeKeySet = new HashSet<string>(existingLikeKeys.Select(l => $"{l.PostId}:{l.UserId}"));

        var now = DateTime.UtcNow;
        var postsCreated = 0;
        var commentsCreated = 0;
        var likesCreated = 0;

        // Post definitions: (postId, authorId, content, age, comments[], likedBy[])
        var seed = new (Guid PostId, Guid AuthorId, string Content, TimeSpan Age,
            (Guid CommentId, Guid AuthorId, string Content, TimeSpan CommentAge)[] Comments,
            Guid[] LikedBy)[]
        {
            // Post 1 — Urdu: disease question
            (
                new Guid("aa300001-0001-4000-8000-000000000001"), QaUser,
                "السلام علیکم! میری کپاس کے پتوں پر سفید مکھیاں بہت زیادہ نظر آ رہی ہیں اور پتے مڑ رہے ہیں۔ کیا یہ لیف کرل وائرس ہے؟ Multan کا علاقہ ہے، فصل 45 دن کی ہو گئی ہے۔ براہ کرم رہنمائی فرمائیں۔",
                TimeSpan.FromHours(3),
                new[]
                {
                    (new Guid("aa300001-c001-4000-8000-000000000001"), MockUser1,
                     "Whiteflies leaf curl ka sab se bara sabab hain. Neem oil ka spray try karein — 5ml per liter pani. Agar zyada hai to local agriculture office se rabta karein.", TimeSpan.FromHours(2)),
                    (new Guid("aa300001-c002-4000-8000-000000000001"), QaUser2,
                     "میں نے بھی Multan میں یہ مسئلہ دیکھا ہے۔ Yellow sticky traps بھی استعمال کریں، بہت مدد ملتی ہے۔", TimeSpan.FromHours(1))
                },
                new[] { MockUser1, MockUser2, QaUser2 }
            ),
            // Post 2 — English: buy/sell equipment
            (
                new Guid("aa300002-0001-4000-8000-000000000001"), QaUser2,
                "Selling my used Massey Ferguson tractor trolley — 3 ton capacity, excellent condition, only 2 seasons used. Price: PKR 185,000 (negotiable). Located in Sahiwal. Interested farmers can message me directly on Kisan Network. Cash payment preferred.",
                TimeSpan.FromHours(8),
                new[]
                {
                    (new Guid("aa300002-c001-4000-8000-000000000001"), MockUser3,
                     "Is the trolley still available? I'm looking for one in Sahiwal area. Can you share some photos?", TimeSpan.FromHours(6)),
                    (new Guid("aa300002-c002-4000-8000-000000000001"), QaUser2,
                     "Yes still available! I'll send you photos via direct message. We can arrange a viewing this weekend.", TimeSpan.FromHours(5))
                },
                new[] { QaUser, MockUser3 }
            ),
            // Post 3 — Urdu: success story
            (
                new Guid("aa300003-0001-4000-8000-000000000001"), MockUser1,
                "الحمدللہ! اس سال گندم کی پیداوار بہت اچھی رہی۔ 12 ایکڑ سے 280 منڈ نکلے۔ SABZ کی monitoring alerts کی وجہ سے وقت پر سپرے کر دیا اور rust سے بچا ہو گیا۔ سب کسان بھائیوں کو بھی دعا ہے کہ آپ کی فصلیں بھی کامیاب ہوں۔ 🌾",
                TimeSpan.FromHours(18),
                new[]
                {
                    (new Guid("aa300003-c001-4000-8000-000000000001"), QaUser,
                     "Mubarak ho! Bohat acha result hai. Aap financial ledger mein expenses record karein taake net profit nazar aaye.", TimeSpan.FromHours(12)),
                    (new Guid("aa300003-c002-4000-8000-000000000001"), MockUser2,
                     "ماشاءاللہ! بھائی آپ کا فارم کس علاقے میں ہے؟ اگلے سیزن میں مجھے بھی اسی قسم کا بیج چاہیے۔", TimeSpan.FromHours(10))
                },
                new[] { QaUser, QaUser2, MockUser2, MockUser3 }
            ),
            // Post 4 — English: expert advice
            (
                new Guid("aa300004-0001-4000-8000-000000000001"), MockUser2,
                "Expert tip for rice farmers: At 35 days after transplanting, check your paddy for leaf folders and stem borers. Look for: (1) Folded leaves with larvae inside, (2) Dead hearts in the center of the hill, (3) Brown planthoppers at the water level. Early detection saves the entire crop! Use the Disease Camera feature for instant AI identification.",
                TimeSpan.FromDays(1),
                new[]
                {
                    (new Guid("aa300004-c001-4000-8000-000000000001"), QaUser,
                     "Very helpful! I have rice at exactly this stage in Sahiwal. Will check tomorrow morning and update here.", TimeSpan.FromHours(20))
                },
                new[] { QaUser, MockUser1 }
            ),
            // Post 5 — Urdu: question about fertilizer
            (
                new Guid("aa300005-0001-4000-8000-000000000001"), MockUser3,
                "کیا کوئی کسان گنے کی فصل میں یوریا کی صحیح مقدار بتا سکتا ہے؟ میرا فارم Rahim Yar Khan میں ہے اور زمین لوامی ہے۔ میں نے پہلی آبیاری پر 50 کلو یوریا ڈالا تھا۔ کیا دوسری آبیاری پر دوبارہ ڈالنا چاہیے؟",
                TimeSpan.FromDays(2),
                new[]
                {
                    (new Guid("aa300005-c001-4000-8000-000000000001"), QaUser,
                     "Loami zameen mein 50kg urea per acre theek hai. Doosri abaayari par 30-40kg aur daal dein. Zyada na daalein — varna ganna meetha kam aur resha zyada hoga.", TimeSpan.FromDays(1).Add(TimeSpan.FromHours(-6))),
                    (new Guid("aa300005-c002-4000-8000-000000000001"), MockUser1,
                     "میں نے بھی Rahim Yar Khan میں گنا کیا ہے۔ DAP بھی شامل کریں اگر زمین کمزور ہے۔ Input Calculator سے حساب لگا سکتے ہیں۔", TimeSpan.FromDays(1).Add(TimeSpan.FromHours(-8)))
                },
                new[] { QaUser, MockUser1, MockUser2 }
            ),
            // Post 6 — English: marketplace / selling
            (
                new Guid("aa300006-0001-4000-8000-000000000001"), MockUser2,
                "Fresh potato harvest available from Swat valley — 50kg bags, Grade A quality, PKR 2,800 per bag. Minimum order 10 bags. Direct from farm, no middleman. Transport can be arranged for bulk orders. Contact via Kisan Network message. Delivery available within 200km radius.",
                TimeSpan.FromDays(3),
                Array.Empty<(Guid, Guid, string, TimeSpan)>(),
                new[] { QaUser, MockUser3 }
            ),
            // Post 7 — Urdu: weather warning
            (
                new Guid("aa300007-0001-4000-8000-000000000001"), QaUser,
                "⚠️ موسم کی خبردار! Chakwal اور ارد گرد کے علاقوں میں اگلے 3 دن میں بارش کا امکان ہے۔ گندم کی فصل کاٹنے والے کسان فوری اقدام کریں۔ اگر فصل پک گئی ہے تو جلد کاٹ لیں ورنہ بارش سے نقصان ہو سکتا ہے۔ SABZ weather alerts آن رکھیں۔",
                TimeSpan.FromDays(4),
                new[]
                {
                    (new Guid("aa300007-c001-4000-8000-000000000001"), MockUser2,
                     "Shukriya alert ke liye! Meri wheat crop 90% ready hai. Kal se harvesting start kar raha hoon.", TimeSpan.FromDays(3)),
                    (new Guid("aa300007-c002-4000-8000-000000000001"), MockUser3,
                     "بارش کی خبر واقعی آ رہی ہے۔ میں نے اپنے تمام کھیتوں میں آبپاشی روک دی ہے۔", TimeSpan.FromDays(3).Add(TimeSpan.FromHours(-4)))
                },
                new[] { MockUser1, MockUser2, MockUser3, QaUser2 }
            ),
            // Post 8 — English: new farmer intro
            (
                new Guid("aa300008-0001-4000-8000-000000000001"), MockUser3,
                "Hello fellow farmers! I'm Amina from Chakwal, new to SABZ. I have 5 acres of rainfed land growing wheat and gram. Looking forward to learning from everyone's experience here. Any tips for a beginner using crop monitoring features?",
                TimeSpan.FromDays(5),
                new[]
                {
                    (new Guid("aa300008-c001-4000-8000-000000000001"), QaUser,
                     "Welcome Amina! Start by adding your farm in the Farms section, then plant your crops with accurate dates. The monitoring system will automatically generate check reminders. Don't miss the Daily Tasks on the dashboard!", TimeSpan.FromDays(4)),
                    (new Guid("aa300008-c002-4000-8000-000000000001"), MockUser1,
                     "Welcome! Rainfed farming is tough but rewarding. Check the crop suitability feature — it'll tell you exactly which crops work best for your soil and location.", TimeSpan.FromDays(4).Add(TimeSpan.FromHours(-6)))
                },
                new[] { QaUser, MockUser1, MockUser2 }
            ),
            // Post 9 — Urdu: disease camera praise
            (
                new Guid("aa300009-0001-4000-8000-000000000001"), MockUser1,
                "SABZ کی Disease Camera feature واقعی کمال کی ہے! میرے ٹماٹر کی فصل میں early blight تھا، تصویر لی تو فوراً پتہ چل گیا۔ وقت پر علاج کیا اور فصل بچ گئی۔ سب کسانوں کو یہ feature استعمال کرنی چاہیے۔",
                TimeSpan.FromDays(6),
                Array.Empty<(Guid, Guid, string, TimeSpan)>(),
                new[] { QaUser, QaUser2, MockUser2, MockUser3 }
            ),
            // Post 10 — English: price discussion
            (
                new Guid("aa300010-0001-4000-8000-000000000001"), QaUser2,
                "Mandi rates update: Wheat in Multan mandi is currently PKR 3,200-3,400 per maund. Rice (Basmati) at PKR 5,500-6,000. Cotton prices holding steady at PKR 7,000-7,500. Check the Crop Prices section for daily updates from major mandis across Punjab and Sindh.",
                TimeSpan.FromDays(7),
                new[]
                {
                    (new Guid("aa300010-c001-4000-8000-000000000001"), MockUser3,
                     "Thanks for the update! Wheat prices are good this season. Anyone know the rate in Chakwal mandi?", TimeSpan.FromDays(6)),
                    (new Guid("aa300010-c002-4000-8000-000000000001"), QaUser,
                     "Chakwal mandi mein wheat PKR 3,100-3,300 chal rahi hai. Thoda kam hai Multan se. Transport cost ka farq hai.", TimeSpan.FromDays(5))
                },
                new[] { MockUser1, MockUser3 }
            ),
        };

        foreach (var (postId, authorId, content, age, comments, likedBy) in seed)
        {
            if (!existingPostIds.Contains(postId))
            {
                db.CommunityPosts.Add(new CommunityPost
                {
                    Id = postId,
                    UserId = authorId,
                    Content = content,
                    CreatedAt = now - age
                });
                postsCreated++;
            }

            foreach (var (commentId, commentAuthorId, commentContent, commentAge) in comments)
            {
                if (!existingCommentIds.Contains(commentId))
                {
                    db.CommunityComments.Add(new CommunityComment
                    {
                        Id = commentId,
                        PostId = postId,
                        UserId = commentAuthorId,
                        Content = commentContent,
                        CreatedAt = now - commentAge
                    });
                    commentsCreated++;
                }
            }

            foreach (var likerId in likedBy)
            {
                var key = $"{postId}:{likerId}";
                if (likeKeySet.Contains(key)) continue;

                db.CommunityPostLikes.Add(new CommunityPostLike
                {
                    Id = Guid.NewGuid(),
                    PostId = postId,
                    UserId = likerId,
                    CreatedAt = now - age + TimeSpan.FromMinutes(30)
                });
                likeKeySet.Add(key);
                likesCreated++;
            }
        }

        if (postsCreated > 0 || commentsCreated > 0 || likesCreated > 0)
            await db.SaveChangesAsync();

        return (postsCreated, commentsCreated, likesCreated);
    }

    // ── 6. Financial transactions ─────────────────────────────────────
    private static async Task<int> SeedFinancialsAsync(SabzDbContext db, Dictionary<string, Guid> farmIds)
    {
        if (farmIds.Count == 0) return 0;

        var existing = await db.FinancialTransactions.Select(t => t.Id).ToListAsync();
        var created = 0;
        var now = DateTime.UtcNow;

        var txDefs = new (Guid Id, string FarmKey, Guid? CropId, string Type, string Category, decimal Amount, int DaysAgo, string? Notes)[]
        {
            // Chakwal wheat expenses
            (new Guid("aa400001-0001-4000-8000-000000000001"), "chakwal", null, "Expense", "Seeds",        18000, 120, "Wheat seed purchase — 500kg certified"),
            (new Guid("aa400002-0001-4000-8000-000000000001"), "chakwal", null, "Expense", "Fertilizer",   35000, 110, "DAP and Urea for wheat"),
            (new Guid("aa400003-0001-4000-8000-000000000001"), "chakwal", null, "Expense", "Pesticides",   12000,  80, "Rust prevention spray"),
            (new Guid("aa400004-0001-4000-8000-000000000001"), "chakwal", null, "Income",  "Crop Sale",    95000,  10, "Wheat sold at Chakwal mandi — 280 maund"),

            // Multan cotton expenses
            (new Guid("aa400005-0001-4000-8000-000000000001"), "multan",  null, "Expense", "Seeds",        25000,  50, "Cotton seed — Bt variety"),
            (new Guid("aa400006-0001-4000-8000-000000000001"), "multan",  null, "Expense", "Fertilizer",   42000,  45, "DAP, Urea, SOP for cotton"),
            (new Guid("aa400007-0001-4000-8000-000000000001"), "multan",  null, "Expense", "Irrigation",    8000,  30, "Tube-well electricity charges"),

            // Sahiwal rice expenses
            (new Guid("aa400008-0001-4000-8000-000000000001"), "sahiwal", null, "Expense", "Seeds",        22000,  60, "Basmati rice seed"),
            (new Guid("aa400009-0001-4000-8000-000000000001"), "sahiwal", null, "Expense", "Fertilizer",   38000,  55, "Rice fertilizer package"),
            (new Guid("aa400010-0001-4000-8000-000000000001"), "sahiwal", null, "Income",  "Crop Sale",    72000,  15, "Partial rice sale — 120 maund"),

            // RYK sugarcane
            (new Guid("aa400011-0001-4000-8000-000000000001"), "ryk",     null, "Expense", "Seeds",        45000, 200, "Sugarcane setts"),
            (new Guid("aa400012-0001-4000-8000-000000000001"), "ryk",     null, "Expense", "Fertilizer",   65000, 180, "Full fertilizer package for sugarcane"),
            (new Guid("aa400013-0001-4000-8000-000000000001"), "ryk",     null, "Income",  "Crop Sale",   180000,  25, "Sugarcane sold to mill — 400 maund"),

            // Swat vegetable farm
            (new Guid("aa400014-0001-4000-8000-000000000001"), "swat",    null, "Expense", "Seeds",        15000,  40, "Maize, potato, tomato seeds"),
            (new Guid("aa400015-0001-4000-8000-000000000001"), "swat",    null, "Expense", "Pesticides",    9000,  25, "Tomato blight spray"),
            (new Guid("aa400016-0001-4000-8000-000000000001"), "swat",    null, "Income",  "Crop Sale",    48000,   5, "Potato harvest sold locally"),
        };

        foreach (var (txId, farmKey, cropId, type, category, amount, daysAgo, notes) in txDefs)
        {
            if (existing.Contains(txId)) continue;
            if (!farmIds.TryGetValue(farmKey, out var farmId)) continue;

            db.FinancialTransactions.Add(new FinancialTransaction
            {
                Id = txId,
                FarmId = farmId,
                CropId = cropId,
                TransactionType = type == "Income" ? FinancialTransactionType.Income : FinancialTransactionType.Expense,
                Category = category,
                Amount = amount,
                TransactionDate = now.AddDays(-daysAgo).Date,
                Notes = notes,
                CreatedAt = now.AddDays(-daysAgo)
            });
            created++;
        }

        if (created > 0) await db.SaveChangesAsync();
        return created;
    }

    // ── 7. Notifications ──────────────────────────────────────────────
    private static async Task<int> SeedNotificationsAsync(SabzDbContext db)
    {
        var existing = await db.Notifications.Select(n => n.Id).ToListAsync();
        var created = 0;
        var now = DateTime.UtcNow;

        var notifs = new (Guid Id, Guid UserId, string Title, string Message, string Category, string RefType, int HoursAgo, bool IsRead, Guid RefId)[]
        {
            (new Guid("aa500001-0001-4000-8000-000000000001"), QaUser,
             "Monitoring check due", "Leaf health and pest check is due for your Wheat crop at Chakwal Wheat Farm.",
             "MonitoringDue", ReferenceTypes.CropMonitoringCheck, 2, false,
             new Guid("aa600001-0001-4000-8000-000000000001")),
            (new Guid("aa500002-0001-4000-8000-000000000001"), QaUser,
             "Monitoring check due", "Pest pressure check is due for your Cotton crop at Multan Cotton Fields.",
             "MonitoringDue", ReferenceTypes.CropMonitoringCheck, 6, false,
             new Guid("aa600002-0001-4000-8000-000000000001")),
            (new Guid("aa500003-0001-4000-8000-000000000001"), QaUser,
             "Welcome to SABZ!", "Your farm dashboard is ready. Add crops, track monitoring checks, and connect with fellow farmers on Kisan Network.",
             "General", ReferenceTypes.None, 48, true,
             new Guid("aa600004-0001-4000-8000-000000000001")),
            (new Guid("aa500004-0001-4000-8000-000000000001"), QaUser,
             "New comment on your post", "Fatima Khan commented on your disease question post.",
             "General", ReferenceTypes.None, 1, false,
             new Guid("aa600005-0001-4000-8000-000000000001")),
            (new Guid("aa500005-0001-4000-8000-000000000001"), QaUser2,
             "Monitoring check due", "Establishment check is due for your Rice crop at Sahiwal Rice Paddy.",
             "MonitoringDue", ReferenceTypes.CropMonitoringCheck, 12, false,
             new Guid("aa600003-0001-4000-8000-000000000001")),
            (new Guid("aa500006-0001-4000-8000-000000000001"), QaUser2,
             "New message", "Demo Farmer sent you a direct message.",
             "General", ReferenceTypes.None, 4, false,
             new Guid("aa600006-0001-4000-8000-000000000001")),
        };

        foreach (var (id, userId, title, message, category, refType, hoursAgo, isRead, refId) in notifs)
        {
            if (existing.Contains(id)) continue;

            db.Notifications.Add(new Notification
            {
                Id = id,
                UserId = userId,
                Title = title,
                Message = message,
                Category = category,
                ReferenceType = refType,
                ReferenceId = refId,
                IsRead = isRead,
                CreatedAt = now.AddHours(-hoursAgo),
                ReadAt = isRead ? now.AddHours(-hoursAgo + 1) : null
            });
            created++;
        }

        if (created > 0) await db.SaveChangesAsync();
        return created;
    }
}
